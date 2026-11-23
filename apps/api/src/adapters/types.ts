import type { MarketScope, WorkArrangement } from '@jobapp/shared';

/** A job as an adapter hands it over, before extraction / dedup. */
export interface RawJob {
  sourcePlatform: string;
  externalJobId: string | null;
  title: string;
  companyName: string;
  location: string;
  /** Location parts the source gives explicitly (preferred over parsing `location`). */
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  workArrangement?: WorkArrangement | null;
  isRemote?: boolean | null;
  descriptionText: string;
  applyUrl: string;
  postedAt: Date | null;
  sourceMinYears?: number | null;
  sourceSkills?: string[] | null;
}

export interface MarketTarget {
  scope: MarketScope;
  countryCode?: string;
  city?: string;
}

export interface IngestionQuery {
  titles: string[];
  markets: MarketTarget[];
  workArrangements: WorkArrangement[];
}

/** One feed within an adapter run. Feeds are the unit of "stale listing" detection. */
export interface FeedResult {
  /** e.g. "jsearch" or "greenhouse:stripe" */
  sourceKey: string;
  jobs: RawJob[];
  /**
   * True when the feed is a company's complete board, so any previously seen job from this
   * feed that is missing now has been taken down.
   */
  isCompleteSnapshot: boolean;
}

export interface JobSourceAdapter {
  readonly name: string;
  isEnabled(): boolean;
  fetch(query: IngestionQuery): AsyncIterable<FeedResult>;
}
