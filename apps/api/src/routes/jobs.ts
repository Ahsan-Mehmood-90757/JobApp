import { countryName, JobSearchQuerySchema, type Job, type Resume, type JobDetail, type MarketOption, type Paginated } from '@jobapp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool';
import { totalYears } from '../resume/dates';
import { quickScore, resumeSkillSet } from '../resume/match';

const JOB_COLUMNS = `
  id, source_platform, title, company_name, location, city, region, trim(country_code) AS country_code,
  work_arrangement, min_years_experience, max_years_experience, experience_source, seniority_tier,
  core_skills, apply_url, posted_at, last_verified_at`;

type JobDbRow = {
  id: string;
  source_platform: string;
  title: string;
  company_name: string;
  location: string;
  city: string | null;
  region: string | null;
  country_code: string | null;
  work_arrangement: Job['workArrangement'];
  min_years_experience: number | null;
  max_years_experience: number | null;
  experience_source: Job['experienceSource'];
  seniority_tier: Job['seniorityTier'];
  core_skills: string[];
  apply_url: string;
  posted_at: Date | null;
  last_verified_at: Date;
  description_raw?: string;
};

/** If the request names a user with a resume, a scorer for feed cards; otherwise null. */
async function scorerFor(userIdHeader: unknown): Promise<((j: Job) => number) | null> {
  if (typeof userIdHeader !== 'string' || !z.uuid().safeParse(userIdHeader).success) return null;
  const { rows } = await pool.query<{ parsed_json: Resume; target_titles: string[] }>(
    `SELECT r.parsed_json, u.target_titles FROM user_resumes r JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1 ORDER BY r.updated_at DESC LIMIT 1`,
    [userIdHeader],
  );
  const row = rows[0];
  if (!row) return null;
  const profile = {
    skills: resumeSkillSet(row.parsed_json),
    years: totalYears(row.parsed_json.experience),
    titles: [...row.parsed_json.experience.map((e) => e.roleTitle), ...row.target_titles],
  };
  return (j) => quickScore(profile, j);
}

function toJob(r: JobDbRow): Job {
  return {
    id: r.id,
    sourcePlatform: r.source_platform,
    title: r.title,
    companyName: r.company_name,
    location: r.location,
    city: r.city,
    region: r.region,
    countryCode: r.country_code,
    workArrangement: r.work_arrangement,
    minYearsExperience: r.min_years_experience,
    maxYearsExperience: r.max_years_experience,
    experienceSource: r.experience_source,
    seniorityTier: r.seniority_tier,
    coreSkills: r.core_skills,
    applyUrl: r.apply_url,
    postedAt: r.posted_at?.toISOString() ?? null,
    lastVerifiedAt: r.last_verified_at.toISOString(),
    matchScore: null,
  };
}

export async function jobRoutes(app: FastifyInstance) {
  /**
   * GET /api/jobs
   * q, max_experience, market=global|country|city, country=ISO2, city, work_type=remote,hybrid,
   * seniority=entry,mid, posted_within_days, page, page_size
   *
   * Market semantics: remote jobs are matched by country (or "anywhere" when the posting names
   * no country); onsite and hybrid jobs must be in the chosen country / city.
   */
  app.get('/api/jobs', async (req, reply) => {
    const parsed = JobSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', issues: z.treeifyError(parsed.error) });
    const f = parsed.data;

    const where: string[] = ['is_active'];
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };

    let rank = '0';
    if (f.q) {
      const tsq = `websearch_to_tsquery('english', ${p(f.q)})`;
      where.push(`search_vector @@ ${tsq}`);
      rank = `ts_rank_cd(search_vector, ${tsq})`;
    }
    if (f.max_experience !== undefined) {
      // Postings that state no requirement stay visible; the client labels them.
      where.push(`(min_years_experience IS NULL OR min_years_experience <= ${p(f.max_experience)})`);
    }
    if (f.work_type) where.push(`work_arrangement = ANY(${p(f.work_type)}::work_arrangement[])`);
    if (f.seniority) where.push(`seniority_tier = ANY(${p(f.seniority)}::seniority_tier[])`);
    if (f.posted_within_days) {
      where.push(`COALESCE(posted_at, first_seen_at) >= now() - make_interval(days => ${p(f.posted_within_days)})`);
    }
    if (f.market === 'country') {
      const c = p(f.country);
      where.push(`(country_code = ${c} OR (work_arrangement = 'remote' AND country_code IS NULL))`);
    } else if (f.market === 'city') {
      const c = p(f.country);
      const city = p(f.city);
      where.push(`(
        (work_arrangement <> 'remote' AND lower(city) = lower(${city}) AND (country_code = ${c} OR country_code IS NULL))
        OR (work_arrangement = 'remote' AND (country_code = ${c} OR country_code IS NULL))
      )`);
    }

    // Freshness decays with a one-week half-life-ish curve; relevance dominates when searching.
    const age = `GREATEST(EXTRACT(EPOCH FROM now() - COALESCE(posted_at, first_seen_at)) / 86400.0, 0)`;
    const orderBy = f.q
      ? `(${rank} * (1.0 / (1.0 + ${age} / 7.0))) DESC, COALESCE(posted_at, first_seen_at) DESC`
      : `COALESCE(posted_at, first_seen_at) DESC`;

    const limit = p(f.page_size);
    const offset = p((f.page - 1) * f.page_size);
    const sql = `SELECT ${JOB_COLUMNS}, COUNT(*) OVER() AS total_count
                   FROM jobs WHERE ${where.join(' AND ')}
                   ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    const { rows } = await pool.query<JobDbRow & { total_count: string }>(sql, params);

    const score = await scorerFor(req.headers['x-user-id']);
    const body: Paginated<Job> = {
      items: rows.map(toJob).map((j) => (score ? { ...j, matchScore: score(j) } : j)),
      page: f.page,
      pageSize: f.page_size,
      total: rows[0] ? Number(rows[0].total_count) : 0,
    };
    return body;
  });

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    if (!z.uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'invalid_id' });
    const { rows } = await pool.query<JobDbRow>(`SELECT ${JOB_COLUMNS}, description_raw FROM jobs WHERE id = $1`, [req.params.id]);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const base = toJob(row);
    const score = await scorerFor(req.headers['x-user-id']);
    const job: JobDetail = { ...base, matchScore: score ? score(base) : null, descriptionRaw: row.description_raw ?? '' };
    return job;
  });

  /** Countries and cities that currently have active jobs, for the market picker. */
  app.get('/api/markets', async () => {
    const { rows } = await pool.query<{ country_code: string; city: string | null; n: string }>(
      `SELECT trim(country_code) AS country_code, city, count(*) AS n
         FROM jobs WHERE is_active AND country_code IS NOT NULL
        GROUP BY GROUPING SETS ((country_code), (country_code, city))
        ORDER BY n DESC`,
    );
    const byCountry = new Map<string, MarketOption>();
    for (const r of rows) {
      if (r.city === null && !byCountry.has(r.country_code)) {
        byCountry.set(r.country_code, { countryCode: r.country_code, countryName: countryName(r.country_code), jobCount: Number(r.n), cities: [] });
      }
    }
    for (const r of rows) {
      if (r.city !== null) byCountry.get(r.country_code)?.cities.push({ city: r.city, jobCount: Number(r.n) });
    }
    for (const m of byCountry.values()) m.cities = m.cities.slice(0, 50);
    return [...byCountry.values()];
  });
}
