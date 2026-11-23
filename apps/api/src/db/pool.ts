import pg from 'pg';
import { config } from '../config';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });

export async function closePool(): Promise<void> {
  await pool.end();
}
