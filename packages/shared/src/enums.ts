/** How the job is worked. Every job is exactly one of these. */
export const WORK_ARRANGEMENTS = ['remote', 'onsite', 'hybrid'] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

/**
 * Geographic reach of a search ("job market").
 * - global:  no location filter
 * - country: jobs in one country (ISO 3166-1 alpha-2), plus remote jobs open to that country
 * - city:    onsite/hybrid jobs in one city, plus remote jobs open to that city's country
 */
export const MARKET_SCOPES = ['global', 'country', 'city'] as const;
export type MarketScope = (typeof MARKET_SCOPES)[number];

export const SENIORITY_TIERS = ['entry', 'mid', 'senior', 'lead'] as const;
export type SeniorityTier = (typeof SENIORITY_TIERS)[number];

export const SAVED_JOB_STATUSES = ['saved', 'applied', 'interviewing', 'offer', 'rejected'] as const;
export type SavedJobStatus = (typeof SAVED_JOB_STATUSES)[number];

/** Where a min_years_experience value came from, so the UI can show confidence. */
export const EXTRACTION_SOURCES = ['source', 'heuristic', 'inferred', 'llm'] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];
