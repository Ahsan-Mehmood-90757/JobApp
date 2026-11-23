import { z } from 'zod';
import {
  MARKET_SCOPES,
  SENIORITY_TIERS,
  WORK_ARRANGEMENTS,
  type ExtractionSource,
  type SeniorityTier,
  type WorkArrangement,
} from './enums';

/** A job as returned by the API. */
export interface Job {
  id: string;
  sourcePlatform: string;
  title: string;
  companyName: string;
  location: string;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  workArrangement: WorkArrangement;
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  experienceSource: ExtractionSource | null;
  seniorityTier: SeniorityTier | null;
  coreSkills: string[];
  applyUrl: string;
  postedAt: string | null;
  lastVerifiedAt: string;
}

export interface JobDetail extends Job {
  descriptionRaw: string;
}

/** Comma-separated list param, e.g. work_type=remote,hybrid */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(values)).min(1));

export const JobSearchQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    max_experience: z.coerce.number().int().min(0).max(50).optional(),
    market: z.enum(MARKET_SCOPES).default('global'),
    /** ISO 3166-1 alpha-2, required when market is country or city */
    country: z
      .string()
      .trim()
      .length(2)
      .transform((s) => s.toUpperCase())
      .optional(),
    /** required when market is city */
    city: z.string().trim().min(1).max(100).optional(),
    work_type: csvEnum(WORK_ARRANGEMENTS).optional(),
    seniority: csvEnum(SENIORITY_TIERS).optional(),
    posted_within_days: z.coerce.number().int().min(1).max(365).optional(),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((v, ctx) => {
    if ((v.market === 'country' || v.market === 'city') && !v.country) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'country is required for this market' });
    }
    if (v.market === 'city' && !v.city) {
      ctx.addIssue({ code: 'custom', path: ['city'], message: 'city is required when market=city' });
    }
  });

export type JobSearchQuery = z.infer<typeof JobSearchQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** A location the feed currently has jobs for, used to populate market pickers. */
export interface MarketOption {
  countryCode: string;
  countryName: string;
  jobCount: number;
  cities: { city: string; jobCount: number }[];
}
