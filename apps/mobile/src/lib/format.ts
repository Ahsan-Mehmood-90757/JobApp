import { countryName } from '@jobapp/shared/countries';
import type { Job, MarketScope, WorkArrangement } from '@jobapp/shared';

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export const WORK_LABEL: Record<WorkArrangement, string> = { remote: 'Remote', onsite: 'Onsite', hybrid: 'Hybrid' };

export function experienceLabel(job: Pick<Job, 'minYearsExperience' | 'maxYearsExperience' | 'experienceSource'>): string {
  const { minYearsExperience: min, maxYearsExperience: max } = job;
  if (min == null) return 'Exp. not stated';
  const base = max != null && max > min ? `${min}–${max} yrs` : min === 0 ? 'Entry level' : `${min}+ yrs`;
  return job.experienceSource === 'inferred' ? `~${base}` : base;
}

export function jobPlace(job: Pick<Job, 'city' | 'countryCode' | 'location' | 'workArrangement'>): string {
  const parts = [job.city, job.countryCode ? countryName(job.countryCode) : null].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (job.workArrangement === 'remote') return 'Anywhere';
  return job.location || 'Location not listed';
}

export function flag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return '';
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function marketLabel(scope: MarketScope, country?: string | null, city?: string | null): string {
  if (scope === 'global' || !country) return '🌍 Global';
  if (scope === 'city' && city) return `${flag(country)} ${city}`;
  return `${flag(country)} ${countryName(country)}`;
}

const SOURCE_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn', indeed: 'Indeed', glassdoor: 'Glassdoor', ziprecruiter: 'ZipRecruiter',
  greenhouse: 'Company site', lever: 'Company site', ashby: 'Company site', wellfound: 'Wellfound',
};
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replace(/(^|-)\w/g, (m) => m.replace('-', ' ').toUpperCase());

export function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  return score >= 70 ? 'success' : score >= 45 ? 'warning' : 'danger';
}
