import { MARKET_SCOPES, WORK_ARRANGEMENTS, type UserPreferences } from '@jobapp/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool';

/**
 * Identity for the MVP: the app creates an anonymous user once and sends its id as
 * `X-User-Id` on every request. Replace with Supabase Auth (JWT → user id) before launch.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const id = req.headers['x-user-id'];
  if (typeof id !== 'string' || !z.uuid().safeParse(id).success) {
    await reply.code(401).send({ error: 'missing_user', message: 'Send X-User-Id (create one with POST /api/users)' });
    return null;
  }
  const { rowCount } = await pool.query('SELECT 1 FROM users WHERE id = $1', [id]);
  if (!rowCount) {
    await reply.code(401).send({ error: 'unknown_user' });
    return null;
  }
  return id;
}

interface UserRow {
  id: string;
  full_name: string;
  years_experience: number;
  target_titles: string[];
  work_arrangements: UserPreferences['workArrangements'];
  market_scope: UserPreferences['marketScope'];
  market_country_code: string | null;
  market_city: string | null;
}

const USER_COLS = `id, full_name, years_experience, target_titles, work_arrangements::text[] AS work_arrangements,
  market_scope, trim(market_country_code) AS market_country_code, market_city`;

const toPrefs = (r: UserRow): UserPreferences & { id: string } => ({
  id: r.id,
  fullName: r.full_name,
  yearsExperience: r.years_experience,
  targetTitles: r.target_titles,
  workArrangements: r.work_arrangements,
  marketScope: r.market_scope,
  marketCountryCode: r.market_country_code,
  marketCity: r.market_city,
});

// Explicit partial schema (no defaults), so a PUT only touches the fields it sends.
const PrefsInput = z
  .object({
    fullName: z.string().trim().max(200),
    yearsExperience: z.number().int().min(0).max(50),
    targetTitles: z.array(z.string().trim().min(1)).max(10),
    workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)).min(1),
    marketScope: z.enum(MARKET_SCOPES),
    marketCountryCode: z.string().length(2).nullable(),
    marketCity: z.string().trim().min(1).max(100).nullable(),
  })
  .partial()
  .superRefine((v, ctx) => {
    if ((v.marketScope === 'country' || v.marketScope === 'city') && !v.marketCountryCode) {
      ctx.addIssue({ code: 'custom', path: ['marketCountryCode'], message: 'required for this market' });
    }
    if (v.marketScope === 'city' && !v.marketCity) {
      ctx.addIssue({ code: 'custom', path: ['marketCity'], message: 'required when marketScope is city' });
    }
  });

export async function userRoutes(app: FastifyInstance) {
  app.post('/api/users', async (_req, reply) => {
    const { rows } = await pool.query<UserRow>(`INSERT INTO users DEFAULT VALUES RETURNING ${USER_COLS}`);
    return reply.code(201).send(toPrefs(rows[0]!));
  });

  app.get('/api/users/me', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [userId]);
    return toPrefs(rows[0]!);
  });

  app.put('/api/users/me', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const parsed = PrefsInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_body', issues: z.treeifyError(parsed.error) });
    const p = parsed.data;
    // Changing to global clears country/city; country clears city.
    const country = p.marketScope === 'global' ? null : p.marketCountryCode?.toUpperCase();
    const city = p.marketScope === 'global' || p.marketScope === 'country' ? null : p.marketCity;
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
         full_name = COALESCE($2, full_name),
         years_experience = COALESCE($3, years_experience),
         target_titles = COALESCE($4, target_titles),
         work_arrangements = COALESCE($5::work_arrangement[], work_arrangements),
         market_scope = COALESCE($6::market_scope, market_scope),
         market_country_code = CASE WHEN $6 IS NULL THEN market_country_code ELSE $7 END,
         market_city = CASE WHEN $6 IS NULL THEN market_city ELSE $8 END,
         updated_at = now()
       WHERE id = $1 RETURNING ${USER_COLS}`,
      [userId, p.fullName ?? null, p.yearsExperience ?? null, p.targetTitles ?? null, p.workArrangements ?? null, p.marketScope ?? null, country ?? null, city ?? null],
    );
    return toPrefs(rows[0]!);
  });
}
