import { countryName, toCountryCode } from '@jobapp/shared';
import { config } from '../config';
import { getJson } from '../lib/http';
import type { FeedResult, IngestionQuery, JobSourceAdapter, MarketTarget, RawJob } from './types';

/**
 * JSearch (RapidAPI) — aggregates Google for Jobs, which covers LinkedIn, Indeed, Glassdoor,
 * ZipRecruiter and company sites. https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 *
 * Quota note: every page is one request. The free tier is ~200 requests/month, so keep
 * titles × markets × JSEARCH_PAGES_PER_QUERY small, or raise INGEST_CRON's interval.
 */
const HOST = 'jsearch.p.rapidapi.com';

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_publisher?: string | null;
  job_apply_link: string;
  job_description?: string | null;
  job_is_remote?: boolean | null;
  job_posted_at_datetime_utc?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_location?: string | null;
  job_required_experience?: { required_experience_in_months?: number | null; no_experience_required?: boolean } | null;
  job_required_skills?: string[] | null;
}

interface JSearchResponse {
  status: string;
  data: JSearchJob[];
}

const PUBLISHERS: [RegExp, string][] = [
  [/linkedin/i, 'linkedin'],
  [/indeed/i, 'indeed'],
  [/glassdoor/i, 'glassdoor'],
  [/ziprecruiter/i, 'ziprecruiter'],
  [/monster/i, 'monster'],
  [/wellfound|angel/i, 'wellfound'],
];

function platformFromPublisher(publisher: string | null | undefined): string {
  if (!publisher) return 'jsearch';
  for (const [re, name] of PUBLISHERS) if (re.test(publisher)) return name;
  return publisher.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jsearch';
}

interface SearchPlan {
  query: string;
  country: string;
  remoteOnly: boolean;
}

function plansFor(title: string, market: MarketTarget, wantRemote: boolean, wantOnsiteOrHybrid: boolean): SearchPlan[] {
  const country = (market.countryCode ?? 'US').toLowerCase();
  const plans: SearchPlan[] = [];
  if (market.scope === 'global') {
    if (wantRemote) plans.push({ query: `${title} remote`, country, remoteOnly: true });
    if (wantOnsiteOrHybrid) plans.push({ query: title, country, remoteOnly: false });
  } else if (market.scope === 'country') {
    plans.push({ query: `${title} in ${countryName(market.countryCode)}`, country, remoteOnly: !wantOnsiteOrHybrid });
  } else {
    plans.push({ query: `${title} in ${market.city}`, country, remoteOnly: !wantOnsiteOrHybrid });
  }
  return plans;
}

export class JSearchAdapter implements JobSourceAdapter {
  readonly name = 'jsearch';

  isEnabled(): boolean {
    return config.JSEARCH_API_KEY.length > 0;
  }

  async *fetch(query: IngestionQuery): AsyncIterable<FeedResult> {
    const wantRemote = query.workArrangements.includes('remote');
    const wantOther = query.workArrangements.some((w) => w !== 'remote');
    const jobs: RawJob[] = [];

    for (const title of query.titles) {
      for (const market of query.markets) {
        for (const plan of plansFor(title, market, wantRemote, wantOther)) {
          for (let page = 1; page <= config.JSEARCH_PAGES_PER_QUERY; page++) {
            const params = new URLSearchParams({
              query: plan.query,
              page: String(page),
              num_pages: '1',
              country: plan.country,
              date_posted: 'week',
            });
            if (plan.remoteOnly) params.set('work_from_home', 'true');
            try {
              const res = await getJson<JSearchResponse>(`https://${HOST}/search?${params}`, {
                headers: { 'X-RapidAPI-Key': config.JSEARCH_API_KEY, 'X-RapidAPI-Host': HOST },
              });
              jobs.push(...(res.data ?? []).map(toRawJob));
              if ((res.data ?? []).length < 10) break;
            } catch (err) {
              console.warn(`[jsearch] "${plan.query}" (${plan.country}) failed: ${(err as Error).message}`);
              break;
            }
          }
        }
      }
    }
    // Search results are a sample, not a full board: never treat missing jobs as removed.
    yield { sourceKey: 'jsearch', jobs, isCompleteSnapshot: false };
  }
}

function toRawJob(j: JSearchJob): RawJob {
  const months = j.job_required_experience?.required_experience_in_months;
  const noExp = j.job_required_experience?.no_experience_required;
  const location = j.job_location || [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
  return {
    sourcePlatform: platformFromPublisher(j.job_publisher),
    externalJobId: j.job_id,
    title: j.job_title,
    companyName: j.employer_name,
    location: location || (j.job_is_remote ? 'Remote' : ''),
    city: j.job_city ?? null,
    region: j.job_state ?? null,
    countryCode: toCountryCode(j.job_country),
    isRemote: j.job_is_remote ?? null,
    descriptionText: j.job_description ?? '',
    applyUrl: j.job_apply_link,
    postedAt: j.job_posted_at_datetime_utc ? new Date(j.job_posted_at_datetime_utc) : null,
    sourceMinYears: months != null ? months / 12 : noExp ? 0 : null,
    sourceSkills: j.job_required_skills ?? null,
  };
}
