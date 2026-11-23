import { toCountryCode, type WorkArrangement } from '@jobapp/shared';
import { config } from '../config';
import { getJson } from '../lib/http';
import { htmlToText } from '../lib/text';
import type { FeedResult, JobSourceAdapter, RawJob } from './types';

/**
 * ATS-direct feeds: the public JSON job-board APIs Greenhouse, Lever and Ashby expose for
 * every company that uses them. No key needed, and each response is the company's complete
 * board, which makes it the most reliable freshness signal we have.
 */

type Provider = 'greenhouse' | 'lever' | 'ashby';

interface Board {
  provider: Provider;
  token: string;
}

export function parseBoards(spec: string): Board[] {
  return spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [provider, token] = entry.split(':').map((s) => s?.trim());
      if (!token || !['greenhouse', 'lever', 'ashby'].includes(provider ?? '')) {
        console.warn(`[ats] ignoring bad ATS_BOARDS entry "${entry}" (expected provider:token)`);
        return [];
      }
      return [{ provider: provider as Provider, token }];
    });
}

const prettyCompany = (token: string) =>
  token.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------- Greenhouse
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
}

async function fetchGreenhouse(token: string): Promise<RawJob[]> {
  const res = await getJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  );
  return res.jobs.map((j) => ({
    sourcePlatform: 'greenhouse',
    externalJobId: String(j.id),
    title: j.title.trim(),
    companyName: j.company_name || prettyCompany(token),
    location: j.location?.name ?? '',
    descriptionText: htmlToText(j.content),
    applyUrl: j.absolute_url,
    postedAt: j.first_published ? new Date(j.first_published) : j.updated_at ? new Date(j.updated_at) : null,
  }));
}

// ---------------------------------------------------------------- Lever
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string | null;
  workplaceType?: 'remote' | 'hybrid' | 'onsite' | 'on-site' | 'unspecified';
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
}

const leverWorkplace = (w: LeverPosting['workplaceType']): WorkArrangement | null =>
  w === 'remote' ? 'remote' : w === 'hybrid' ? 'hybrid' : w === 'onsite' || w === 'on-site' ? 'onsite' : null;

async function fetchLever(token: string): Promise<RawJob[]> {
  const postings = await getJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
  return postings.map((p) => {
    const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
    return {
      sourcePlatform: 'lever',
      externalJobId: p.id,
      title: p.text.trim(),
      companyName: prettyCompany(token),
      location: p.categories?.location ?? '',
      countryCode: toCountryCode(p.country ?? null),
      workArrangement: leverWorkplace(p.workplaceType),
      descriptionText: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join('\n\n').trim(),
      applyUrl: p.hostedUrl,
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
    };
  });
}

// ---------------------------------------------------------------- Ashby
interface AshbyJob {
  id?: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: 'OnSite' | 'Remote' | 'Hybrid' | null;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  isListed?: boolean;
  address?: { postalAddress?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } };
}

const ashbyWorkplace = (w: AshbyJob['workplaceType']): WorkArrangement | null =>
  w === 'Remote' ? 'remote' : w === 'Hybrid' ? 'hybrid' : w === 'OnSite' ? 'onsite' : null;

async function fetchAshby(token: string): Promise<RawJob[]> {
  const res = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=false`,
  );
  return res.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const addr = j.address?.postalAddress;
      return {
        sourcePlatform: 'ashby',
        externalJobId: j.id ?? j.jobUrl,
        title: j.title.trim(),
        companyName: prettyCompany(token),
        location: j.location ?? '',
        city: addr?.addressLocality ?? null,
        region: addr?.addressRegion ?? null,
        countryCode: toCountryCode(addr?.addressCountry ?? null),
        workArrangement: ashbyWorkplace(j.workplaceType),
        isRemote: j.isRemote ?? null,
        descriptionText: j.descriptionPlain || htmlToText(j.descriptionHtml),
        applyUrl: j.jobUrl,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      };
    });
}

const FETCHERS: Record<Provider, (token: string) => Promise<RawJob[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

export class AtsDirectAdapter implements JobSourceAdapter {
  readonly name = 'ats';
  private readonly boards = parseBoards(config.ATS_BOARDS);

  isEnabled(): boolean {
    return this.boards.length > 0;
  }

  async *fetch(): AsyncIterable<FeedResult> {
    for (const board of this.boards) {
      const sourceKey = `${board.provider}:${board.token}`;
      try {
        const jobs = await FETCHERS[board.provider](board.token);
        yield { sourceKey, jobs, isCompleteSnapshot: true };
      } catch (err) {
        // Skip, and importantly don't mark this board's jobs stale on a failed fetch.
        console.warn(`[ats] ${sourceKey} failed: ${(err as Error).message}`);
      }
    }
  }
}
