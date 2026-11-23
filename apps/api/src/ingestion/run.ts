import { toCountryCode, type MarketScope, type WorkArrangement } from '@jobapp/shared';
import type { PoolClient } from 'pg';
import { AtsDirectAdapter } from '../adapters/ats';
import { JSearchAdapter } from '../adapters/jsearch';
import type { IngestionQuery, JobSourceAdapter, MarketTarget } from '../adapters/types';
import { config } from '../config';
import { pool } from '../db/pool';
import { normalizeJob, type JobRow } from './normalize';

export const ADAPTERS: JobSourceAdapter[] = [new JSearchAdapter(), new AtsDirectAdapter()];

const MAX_TITLES = 8;
const MAX_MARKETS = 6;

function parseDefaultMarkets(spec: string): MarketTarget[] {
  return spec.split(',').flatMap((entry): MarketTarget[] => {
    const [scope, country, ...cityParts] = entry.trim().split(':');
    if (scope === 'global') return [{ scope: 'global' }];
    const countryCode = toCountryCode(country) ?? undefined;
    if (scope === 'country' && countryCode) return [{ scope: 'country', countryCode }];
    if (scope === 'city' && countryCode && cityParts.length) return [{ scope: 'city', countryCode, city: cityParts.join(':') }];
    return [];
  });
}

/** What to ask search-based sources for: the union of every user's targets, or the defaults. */
export async function buildIngestionQuery(): Promise<IngestionQuery> {
  const { rows } = await pool.query<{
    target_titles: string[];
    market_scope: MarketScope;
    market_country_code: string | null;
    market_city: string | null;
    work_arrangements: WorkArrangement[];
  }>(`SELECT target_titles, market_scope, market_country_code, market_city, work_arrangements::text[] AS work_arrangements FROM users`);

  const titles = new Map<string, string>();
  const markets = new Map<string, MarketTarget>();
  const arrangements = new Set<WorkArrangement>();
  for (const u of rows) {
    for (const t of u.target_titles) titles.set(t.trim().toLowerCase(), t.trim());
    const m: MarketTarget = { scope: u.market_scope, countryCode: u.market_country_code?.trim() || undefined, city: u.market_city ?? undefined };
    markets.set(`${m.scope}:${m.countryCode ?? ''}:${(m.city ?? '').toLowerCase()}`, m);
    for (const w of u.work_arrangements) arrangements.add(w);
  }
  if (titles.size === 0) {
    for (const t of config.DEFAULT_TARGET_TITLES.split(',').map((s) => s.trim()).filter(Boolean)) titles.set(t.toLowerCase(), t);
  }
  if (markets.size === 0) {
    for (const m of parseDefaultMarkets(config.DEFAULT_MARKETS)) markets.set(JSON.stringify(m), m);
  }
  return {
    titles: [...titles.values()].slice(0, MAX_TITLES),
    markets: [...markets.values()].slice(0, MAX_MARKETS),
    workArrangements: arrangements.size ? [...arrangements] : ['remote', 'onsite', 'hybrid'],
  };
}

const UPSERT_SQL = `
INSERT INTO jobs (
  dedup_hash, source_platform, source_key, external_job_id, title, normalized_title, company_name,
  location, city, region, country_code, work_arrangement, min_years_experience, max_years_experience,
  experience_source, seniority_tier, core_skills, description_raw, apply_url, posted_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
ON CONFLICT (dedup_hash) DO UPDATE SET
  last_verified_at = now(),
  is_active        = true,
  inactive_reason  = NULL,
  -- A company's own board is authoritative: it takes ownership of rows first seen via search.
  source_key       = CASE WHEN $21 THEN EXCLUDED.source_key      ELSE jobs.source_key      END,
  source_platform  = CASE WHEN $21 THEN EXCLUDED.source_platform ELSE jobs.source_platform END,
  apply_url        = CASE WHEN $21 THEN EXCLUDED.apply_url       ELSE jobs.apply_url       END,
  external_job_id  = CASE WHEN $21 THEN EXCLUDED.external_job_id ELSE jobs.external_job_id END,
  work_arrangement = EXCLUDED.work_arrangement,
  description_raw  = CASE WHEN length(EXCLUDED.description_raw) > length(jobs.description_raw)
                          THEN EXCLUDED.description_raw ELSE jobs.description_raw END,
  -- Keep stronger experience evidence: source > llm > heuristic > inferred.
  min_years_experience = CASE WHEN jobs.experience_source IS NULL OR jobs.experience_source = 'inferred'
                              THEN EXCLUDED.min_years_experience ELSE jobs.min_years_experience END,
  max_years_experience = CASE WHEN jobs.experience_source IS NULL OR jobs.experience_source = 'inferred'
                              THEN EXCLUDED.max_years_experience ELSE jobs.max_years_experience END,
  experience_source    = CASE WHEN jobs.experience_source IS NULL OR jobs.experience_source = 'inferred'
                              THEN EXCLUDED.experience_source ELSE jobs.experience_source END,
  core_skills      = CASE WHEN cardinality(EXCLUDED.core_skills) > cardinality(jobs.core_skills)
                          THEN EXCLUDED.core_skills ELSE jobs.core_skills END,
  posted_at        = COALESCE(jobs.posted_at, EXCLUDED.posted_at)
RETURNING (xmax = 0) AS inserted`;

async function upsert(client: PoolClient, row: JobRow, authoritative: boolean): Promise<boolean> {
  const { rows } = await client.query<{ inserted: boolean }>(UPSERT_SQL, [
    row.dedupHash, row.sourcePlatform, row.sourceKey, row.externalJobId, row.title, row.normalizedTitle,
    row.companyName, row.location, row.city, row.region, row.countryCode, row.workArrangement, row.minYears,
    row.maxYears, row.experienceSource, row.seniority, row.coreSkills, row.description, row.applyUrl,
    row.postedAt, authoritative,
  ]);
  return rows[0]?.inserted ?? false;
}

export interface FeedSummary {
  sourceKey: string;
  fetched: number;
  inserted: number;
  updated: number;
  deactivated: number;
}

export async function runIngestion(): Promise<FeedSummary[]> {
  const query = await buildIngestionQuery();
  const summaries: FeedSummary[] = [];
  console.log(`[ingest] titles=${JSON.stringify(query.titles)} markets=${JSON.stringify(query.markets)}`);

  for (const adapter of ADAPTERS) {
    if (!adapter.isEnabled()) {
      console.log(`[ingest] ${adapter.name}: disabled (missing config), skipping`);
      continue;
    }
    for await (const feed of adapter.fetch(query)) {
      const startedAt = new Date();
      const runId = (
        await pool.query<{ id: string }>(`INSERT INTO ingestion_runs (kind, source_key, started_at) VALUES ('ingest', $1, $2) RETURNING id`, [feed.sourceKey, startedAt])
      ).rows[0]!.id;

      // Collapse duplicates inside a single feed before hitting the DB.
      const rows = new Map<string, JobRow>();
      for (const raw of feed.jobs) {
        const row = normalizeJob(raw, feed.sourceKey);
        if (row && !rows.has(row.dedupHash)) rows.set(row.dedupHash, row);
      }

      const summary: FeedSummary = { sourceKey: feed.sourceKey, fetched: feed.jobs.length, inserted: 0, updated: 0, deactivated: 0 };
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of rows.values()) {
          if (await upsert(client, row, feed.isCompleteSnapshot)) summary.inserted++;
          else summary.updated++;
        }
        // Complete boards: anything we had from this feed that wasn't in it is gone.
        if (feed.isCompleteSnapshot && rows.size > 0) {
          const res = await client.query(
            `UPDATE jobs SET is_active = false, inactive_reason = 'removed_from_board'
              WHERE source_key = $1 AND is_active AND last_verified_at < $2`,
            [feed.sourceKey, startedAt],
          );
          summary.deactivated = res.rowCount ?? 0;
        }
        await client.query('COMMIT');
        await pool.query(
          `UPDATE ingestion_runs SET finished_at = now(), fetched = $2, inserted = $3, updated = $4, deactivated = $5 WHERE id = $1`,
          [runId, summary.fetched, summary.inserted, summary.updated, summary.deactivated],
        );
      } catch (err) {
        await client.query('ROLLBACK');
        await pool.query(`UPDATE ingestion_runs SET finished_at = now(), error = $2 WHERE id = $1`, [runId, (err as Error).message]);
        console.error(`[ingest] ${feed.sourceKey} failed: ${(err as Error).message}`);
        continue;
      } finally {
        client.release();
      }
      console.log(`[ingest] ${feed.sourceKey}: fetched=${summary.fetched} new=${summary.inserted} updated=${summary.updated} removed=${summary.deactivated}`);
      summaries.push(summary);
    }
  }
  return summaries;
}
