import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().default('postgres://localhost:5432/jobapp'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  /** RapidAPI key for JSearch (LinkedIn/Indeed/Glassdoor coverage). Adapter is skipped when empty. */
  JSEARCH_API_KEY: z.string().default(''),
  /** Max pages per JSearch query (each page = 1 request against your quota, ~10 jobs). */
  JSEARCH_PAGES_PER_QUERY: z.coerce.number().int().min(1).max(10).default(1),

  /**
   * Public ATS boards to pull, comma separated: provider:boardToken
   * providers: greenhouse, lever, ashby
   */
  ATS_BOARDS: z.string().default('greenhouse:stripe,greenhouse:airbnb,lever:spotify,ashby:ramp'),

  /** Titles to ingest when no user has set target titles yet. */
  DEFAULT_TARGET_TITLES: z.string().default('software engineer,product manager,data analyst'),
  /** Markets to ingest from JSearch when no user preferences exist: global | country:US | city:US:Austin */
  DEFAULT_MARKETS: z.string().default('global'),

  INGEST_CRON: z.string().default('0 */4 * * *'),
  SWEEP_CRON: z.string().default('30 3 * * *'),
  /** Deactivate listings posted more than this many days ago. */
  JOB_MAX_AGE_DAYS: z.coerce.number().int().min(1).default(45),

  /** Local file storage (uploaded resumes, exported PDFs). Swap for Supabase Storage later. */
  STORAGE_DIR: z.string().default('./storage'),
  /** Base URL the phone uses to reach this API; signed file links are built from it. */
  PUBLIC_BASE_URL: z.string().default('http://localhost:4000'),
  /** HMAC secret for signed download URLs. Set a long random value outside local dev. */
  FILE_SIGNING_SECRET: z.string().min(16).default('dev-only-signing-secret-change-me'),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(10),
});

export const config = EnvSchema.parse(process.env);
export type Config = typeof config;
