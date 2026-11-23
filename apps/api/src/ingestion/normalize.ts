import { canonicalCity, parseLocation, type ExtractionSource, type SeniorityTier, type WorkArrangement } from '@jobapp/shared';
import type { RawJob } from '../adapters/types';
import { dedupHash, normalizeTitle } from '../lib/text';
import { detectWorkArrangement, extractExperience } from './extract';

export interface JobRow {
  dedupHash: string;
  sourcePlatform: string;
  sourceKey: string;
  externalJobId: string | null;
  title: string;
  normalizedTitle: string;
  companyName: string;
  location: string;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  workArrangement: WorkArrangement;
  minYears: number | null;
  maxYears: number | null;
  experienceSource: ExtractionSource | null;
  seniority: SeniorityTier;
  coreSkills: string[];
  description: string;
  applyUrl: string;
  postedAt: Date | null;
}

const MAX_DESCRIPTION = 60_000;

export function normalizeJob(raw: RawJob, sourceKey: string): JobRow | null {
  const title = raw.title?.trim();
  const company = raw.companyName?.trim();
  if (!title || !company || !raw.applyUrl) return null;

  const location = (raw.location ?? '').replace(/\s+/g, ' ').trim();
  const parsed = parseLocation(location);
  const description = raw.descriptionText.slice(0, MAX_DESCRIPTION);
  const workArrangement = detectWorkArrangement({
    explicit: raw.workArrangement ?? null,
    isRemoteFlag: raw.isRemote ?? null,
    title,
    location,
    description,
  });
  const ex = extractExperience({
    title,
    description,
    sourceMinYears: raw.sourceMinYears ?? null,
    sourceSkills: raw.sourceSkills ?? null,
  });
  const normalizedTitle = normalizeTitle(title) || title.toLowerCase();
  const postedAt = raw.postedAt && !Number.isNaN(raw.postedAt.getTime()) ? raw.postedAt : null;

  return {
    dedupHash: dedupHash(company, normalizedTitle, location),
    sourcePlatform: raw.sourcePlatform,
    sourceKey,
    externalJobId: raw.externalJobId,
    title,
    normalizedTitle,
    companyName: company,
    location,
    city: canonicalCity(raw.city) ?? parsed.city,
    region: raw.region?.trim() || parsed.region,
    countryCode: raw.countryCode ?? parsed.countryCode,
    workArrangement,
    minYears: ex.minYears,
    maxYears: ex.maxYears,
    experienceSource: ex.source,
    seniority: ex.seniority,
    coreSkills: ex.skills,
    description,
    applyUrl: raw.applyUrl,
    postedAt,
  };
}
