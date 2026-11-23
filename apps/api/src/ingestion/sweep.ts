import { config } from '../config';
import { pool } from '../db/pool';
import { fetchWithTimeout, mapLimit } from '../lib/http';

const CLOSED_TEXT =
  /no longer (accepting applications|available|open)|job (has been )?(closed|filled|expired)|position (has been )?(filled|closed)|this (job|posting|position) (is )?(no longer|has expired)|job not found|page not found|posting (has )?expired/i;

/**
 * Many boards redirect a removed posting to the careers/search page instead of returning 404
 * (Greenhouse → company.com/careers/search, others add ?error=true). Treat a redirect that drops
 * the posting's ID, or lands on a listing page, as a closed job.
 */
export function redirectedAwayFromPosting(original: string, final: string): boolean {
  if (!final || final === original) return false;
  if (/[?&]error=true\b/.test(final)) return true;
  let o: URL, f: URL;
  try {
    o = new URL(original);
    f = new URL(final);
  } catch {
    return false;
  }
  const looksLikeId = (v: string) => /\d{4,}|[0-9a-f]{8}-[0-9a-f]{4}/i.test(v);
  const pathId = o.pathname.split('/').filter(Boolean).reverse().find(looksLikeId);
  const queryId = ['gh_jid', 'jid', 'jobId', 'job_id', 'id'].map((k) => o.searchParams.get(k)).find((v) => v && looksLikeId(v));
  const id = pathId ?? queryId;
  // Conservative: only a redirect that loses the posting's ID counts. Landing on a search page
  // that still carries the ID is ambiguous (the site may just render the job there).
  if (id && !f.href.includes(id)) return true;
  return false;
}

export type LinkStatus = 'ok' | 'dead' | 'unknown';

/** HEAD first; fall back to GET (many boards reject HEAD) and scan the page for closed-job text. */
export async function checkLink(url: string): Promise<{ status: LinkStatus; reason?: string }> {
  try {
    let res = await fetchWithTimeout(url, { method: 'HEAD', redirect: 'follow' }, 10000);
    if (res.status === 404 || res.status === 410) return { status: 'dead', reason: `http_${res.status}` };
    if (res.status === 405 || res.status === 403 || res.status >= 500 || res.ok) {
      res = await fetchWithTimeout(url, { method: 'GET', redirect: 'follow' }, 15000);
      if (res.status === 404 || res.status === 410) return { status: 'dead', reason: `http_${res.status}` };
      if (!res.ok) return { status: 'unknown', reason: `http_${res.status}` };
      // Boards that redirect a removed posting to their listing page instead of returning 404.
      if (redirectedAwayFromPosting(url, res.url)) return { status: 'dead', reason: 'redirected_to_board' };
      const body = (await res.text()).slice(0, 200_000);
      // Strip tags so text in scripts/attributes doesn't false-positive as often.
      const visible = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
      if (CLOSED_TEXT.test(visible)) return { status: 'dead', reason: 'closed_text' };
      return { status: 'ok' };
    }
    return { status: 'unknown', reason: `http_${res.status}` };
  } catch (err) {
    return { status: 'unknown', reason: (err as Error).name === 'AbortError' ? 'timeout' : 'network' };
  }
}

export interface SweepSummary {
  checked: number;
  deactivated: number;
  expiredByAge: number;
}

/**
 * Daily: deactivate listings that are too old, then link-check active jobs that haven't been
 * re-confirmed by a feed in 24h and weren't link-checked in the last 24h.
 * Jobs owned by a complete ATS board are skipped: the board refresh already tracks them.
 */
export async function runSweep(limit = 500): Promise<SweepSummary> {
  const runId = (await pool.query<{ id: string }>(`INSERT INTO ingestion_runs (kind) VALUES ('sweep') RETURNING id`)).rows[0]!.id;

  const aged = await pool.query(
    // Only search-sourced jobs: a job still listed on a company's own board is open, however old.
    `UPDATE jobs SET is_active = false, inactive_reason = 'too_old'
      WHERE is_active AND posted_at < now() - make_interval(days => $1)
        AND source_key NOT LIKE 'greenhouse:%' AND source_key NOT LIKE 'lever:%' AND source_key NOT LIKE 'ashby:%'`,
    [config.JOB_MAX_AGE_DAYS],
  );

  const { rows } = await pool.query<{ id: string; apply_url: string }>(
    `SELECT id, apply_url FROM jobs
      WHERE is_active
        AND source_key NOT LIKE 'greenhouse:%' AND source_key NOT LIKE 'lever:%' AND source_key NOT LIKE 'ashby:%'
        AND last_verified_at < now() - interval '24 hours'
        AND (last_link_check_at IS NULL OR last_link_check_at < now() - interval '24 hours')
      ORDER BY last_link_check_at NULLS FIRST
      LIMIT $1`,
    [limit],
  );

  let deactivated = 0;
  await mapLimit(rows, 5, async (job) => {
    const result = await checkLink(job.apply_url);
    if (result.status === 'dead') {
      deactivated++;
      await pool.query(`UPDATE jobs SET is_active = false, inactive_reason = $2, last_link_check_at = now() WHERE id = $1`, [job.id, result.reason]);
    } else {
      await pool.query(`UPDATE jobs SET last_link_check_at = now() WHERE id = $1`, [job.id]);
    }
  });

  const summary = { checked: rows.length, deactivated, expiredByAge: aged.rowCount ?? 0 };
  await pool.query(`UPDATE ingestion_runs SET finished_at = now(), fetched = $2, deactivated = $3 WHERE id = $1`, [
    runId,
    summary.checked,
    summary.deactivated + summary.expiredByAge,
  ]);
  console.log(`[sweep] checked=${summary.checked} dead=${summary.deactivated} too_old=${summary.expiredByAge}`);
  return summary;
}
