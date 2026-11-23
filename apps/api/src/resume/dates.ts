const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const SEASON = String.raw`(?:spring|summer|fall|autumn|winter)`;
/** One date: "Jan 2020", "January, 2020", "01/2020", "2020-01", "2020", "Summer 2019" */
const DATE = String.raw`(?:(?:${MONTH}|${SEASON})\s*,?\s*(?:19|20)\d{2}|(?:0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d{2}|(?:19|20)\d{2}\s*[/.-]\s*(?:0?[1-9]|1[0-2])(?!\d)|(?:19|20)\d{2})`;
const PRESENT = String.raw`(?:present|current(?:ly)?|now|today|ongoing|to date)`;

/** "Jan 2020 – Present", "2018 - 2021", "03/2019 to 06/2022" */
export const DATE_RANGE_RE = new RegExp(String.raw`(${DATE})\s*(?:-|–|—|to|until|→|~)\s*(${DATE}|${PRESENT})`, 'i');
export const SINGLE_DATE_RE = new RegExp(DATE, 'i');

/** Normalize one date to "YYYY-MM" (or "YYYY"), or "Present". */
export function normalizeDate(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (new RegExp(`^${PRESENT}$`, 'i').test(s)) return 'Present';
  let m = /^([a-z]+)\.?\s*,?\s*((?:19|20)\d{2})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3)] ?? ({ spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 } as Record<string, number>)[m[1]!];
    return month ? `${m[2]}-${String(month).padStart(2, '0')}` : m[2]!;
  }
  m = /^(\d{1,2})\s*[/.-]\s*((?:19|20)\d{2})$/.exec(s);
  if (m) return `${m[2]}-${m[1]!.padStart(2, '0')}`;
  m = /^((?:19|20)\d{2})\s*[/.-]\s*(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}`;
  m = /((?:19|20)\d{2})/.exec(s);
  return m ? m[1]! : raw.trim();
}

export function findDateRange(line: string): { start: string; end: string; match: string } | null {
  const m = DATE_RANGE_RE.exec(line);
  if (!m) return null;
  return { start: normalizeDate(m[1]!), end: normalizeDate(m[2]!), match: m[0] };
}

/** Months between YYYY[-MM] values; end "Present" = now. */
function toMonthIndex(d: string, now: Date): number | null {
  if (d === 'Present') return now.getFullYear() * 12 + now.getMonth();
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(d);
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0);
}

/** Total years of experience from date ranges, merging overlaps so concurrent roles don't double count. */
export function totalYears(ranges: { startDate: string; endDate: string }[], now = new Date()): number {
  const spans = ranges
    .map((r) => [toMonthIndex(r.startDate, now), toMonthIndex(r.endDate || 'Present', now)] as const)
    .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null && s[1] >= s[0])
    .map(([a, b]) => [a, b + 1] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  let months = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
    else {
      if (cur) months += cur[1] - cur[0];
      cur = [...s];
    }
  }
  if (cur) months += cur[1] - cur[0];
  return Math.round((months / 12) * 10) / 10;
}
