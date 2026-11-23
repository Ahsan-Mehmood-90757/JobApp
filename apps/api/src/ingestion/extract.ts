import {
  extractSkills,
  type ExtractionSource,
  type SeniorityTier,
  type WorkArrangement,
} from '@jobapp/shared';

export interface ExperienceExtraction {
  minYears: number | null;
  maxYears: number | null;
  source: ExtractionSource | null;
  seniority: SeniorityTier;
  skills: string[];
}

const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15,
};
const N = String.raw`(\d{1,2}|${Object.keys(NUM_WORDS).join('|')})`;
const toNum = (s: string) => NUM_WORDS[s.toLowerCase()] ?? Number(s);

// Each pattern captures min (and optionally max). They require "year(s)" nearby;
// we further require experience-ish context within the same sentence.
const RANGE = new RegExp(String.raw`\b${N}\s*(?:\+\s*)?(?:-|–|to)\s*${N}\+?\s*(?:years?|yrs?)\b`, 'gi');
const PLUS = new RegExp(String.raw`\b${N}\s*\+\s*(?:years?|yrs?)\b`, 'gi');
const AT_LEAST = new RegExp(
  String.raw`\b(?:at\s+least|minimum(?:\s+of)?|min\.?|over|more\s+than)\s+${N}\s*(?:\+\s*)?(?:years?|yrs?)\b`,
  'gi',
);
const OR_MORE = new RegExp(String.raw`\b${N}\s*(?:or\s+more|years?\s+or\s+more)\b`, 'gi');
const PLAIN = new RegExp(String.raw`\b${N}\s*(?:years?|yrs?)(?:'|’)?\s+(?:of\s+)?(?:\w+\s+){0,4}?experience\b`, 'gi');

const CONTEXT = /experience|exp\b|background|working|professional|industry|track record|hands-on/i;
const NEGATIVE_CONTEXT = /\b(company|founded|old|history|anniversary|warranty|vesting|contract|age|in business|we've been|we have been)\b/i;

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('\n', index), index - 160);
  const endDot = text.indexOf('.', index);
  const endNl = text.indexOf('\n', index);
  const ends = [endDot, endNl, index + 160].filter((i) => i > index);
  return text.slice(start + 1, Math.min(...ends));
}

export function extractYears(text: string): { min: number; max: number | null } | null {
  if (!text) return null;
  const found: { min: number; max: number | null }[] = [];
  const taken: [number, number][] = [];
  const consider = (re: RegExp, hasMax: boolean) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      const sentence = sentenceAround(text, m.index ?? 0);
      if (!CONTEXT.test(sentence) || NEGATIVE_CONTEXT.test(sentence)) continue;
      const min = toNum(m[1]!);
      const max = hasMax && m[2] ? toNum(m[2]) : null;
      if (!Number.isFinite(min) || min > 25) continue;
      if (max !== null && (max < min || max > 30)) continue;
      found.push({ min, max });
    }
  };
  consider(RANGE, true);
  consider(PLUS, false);
  consider(AT_LEAST, false);
  consider(OR_MORE, false);
  consider(PLAIN, false);
  if (found.length === 0) return null;
  // Postings often list several requirements ("5+ years backend, 2+ years Go"). The headline
  // requirement is usually the largest minimum; use that.
  found.sort((a, b) => b.min - a.min);
  return found[0]!;
}

const TITLE_TIERS: [RegExp, SeniorityTier][] = [
  [/\b(intern|internship|graduate|new grad|trainee|apprentice|entry[- ]level|junior|jr\.?)\b/i, 'entry'],
  // "Product Manager" / "Account Manager" are not leadership tiers; people managers are.
  [/\b(head of|director|vp|vice president|principal|lead|chief|engineering manager|manager,? engineering|architect)\b/i, 'lead'],
  [/\b(senior|sr\.?|staff|expert|iii|iv|l5|l6)\b/i, 'senior'],
  [/\b(mid[- ]level|intermediate|ii|l3|l4)\b/i, 'mid'],
];

export function seniorityFromTitle(title: string): SeniorityTier | null {
  for (const [re, tier] of TITLE_TIERS) if (re.test(title)) return tier;
  return null;
}

export function seniorityFromYears(years: number): SeniorityTier {
  if (years < 2) return 'entry';
  if (years < 5) return 'mid';
  if (years < 8) return 'senior';
  return 'lead';
}

/** Typical minimum years for a tier, used only when a posting states nothing. */
const TIER_DEFAULT_YEARS: Record<SeniorityTier, number> = { entry: 0, mid: 2, senior: 5, lead: 7 };

export interface ExtractInput {
  title: string;
  description: string;
  /** Experience the source already provides (e.g. JSearch required_experience_in_months / 12). */
  sourceMinYears?: number | null;
  sourceSkills?: string[] | null;
}

/** Deterministic, no-AI extraction of experience, seniority and skills. */
export function extractExperience(input: ExtractInput): ExperienceExtraction {
  const titleTier = seniorityFromTitle(input.title);
  let minYears: number | null = null;
  let maxYears: number | null = null;
  let source: ExtractionSource | null = null;

  if (input.sourceMinYears != null && input.sourceMinYears >= 0) {
    minYears = Math.round(input.sourceMinYears);
    source = 'source';
  } else {
    const years = extractYears(input.description);
    if (years) {
      minYears = years.min;
      maxYears = years.max;
      source = 'heuristic';
    } else if (titleTier) {
      minYears = TIER_DEFAULT_YEARS[titleTier];
      source = 'inferred';
    }
  }

  const seniority = titleTier ?? (minYears != null ? seniorityFromYears(minYears) : 'mid');
  const fromText = extractSkills(`${input.title}\n${input.description}`, 20);
  const skills = [...new Set([...(input.sourceSkills ?? []), ...fromText])].slice(0, 25);
  return { minYears, maxYears, source, seniority, skills };
}

/**
 * Decide remote / hybrid / onsite. Explicit source fields win; otherwise look for signals in the
 * title, the location string and the opening of the description.
 */
export function detectWorkArrangement(opts: {
  explicit?: WorkArrangement | null;
  isRemoteFlag?: boolean | null;
  title: string;
  location: string;
  description: string;
}): WorkArrangement {
  if (opts.explicit) return opts.explicit;
  const head = `${opts.title} ${opts.location}`;
  const intro = opts.description.slice(0, 1500);
  if (/\bhybrid\b/i.test(head)) return 'hybrid';
  if (/\b(remote|work from home|wfh|anywhere)\b/i.test(head)) return 'remote';
  if (opts.isRemoteFlag) {
    // Some boards flag hybrid roles as remote; the description usually says so.
    return /\bhybrid\b/i.test(intro) ? 'hybrid' : 'remote';
  }
  if (/\bhybrid\b/i.test(intro) || /\b\d\s*days?\s*(a|per)\s*week\s*(in|at)\s*(the\s*)?office\b/i.test(intro)) return 'hybrid';
  if (/\b(fully|100%)\s*remote\b|\bremote[- ]first\b/i.test(intro)) return 'remote';
  return 'onsite';
}
