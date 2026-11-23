import cron from 'node-cron';
import { config } from './config';
import { runIngestion } from './ingestion/run';
import { runSweep } from './ingestion/sweep';
import { pool } from './db/pool';

/**
 * Scheduled background worker (Postgres-only; no Redis needed).
 * Each task holds a Postgres advisory lock so running several worker processes is safe.
 */

async function withLock(key: number, name: string, fn: () => Promise<unknown>) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [key]);
    if (!rows[0]?.ok) {
      console.log(`[worker] ${name} already running elsewhere, skipping`);
      return;
    }
    try {
      await fn();
    } catch (err) {
      console.error(`[worker] ${name} failed`, err);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [key]);
    }
  } finally {
    client.release();
  }
}

const ingest = () => withLock(81001, 'ingest', runIngestion);
const sweep = () => withLock(81002, 'sweep', runSweep);

cron.schedule(config.INGEST_CRON, ingest);
cron.schedule(config.SWEEP_CRON, sweep);
console.log(`[worker] ingest "${config.INGEST_CRON}", sweep "${config.SWEEP_CRON}"`);

if (process.argv.includes('--now')) void ingest();
