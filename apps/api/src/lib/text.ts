import { createHash } from 'node:crypto';

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·', copy: '©',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Turn job-board HTML (possibly entity-escaped, as Greenhouse returns it) into readable plain text. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let s = html;
  // Greenhouse double-escapes: &lt;p&gt; → <p>
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LEVEL_WORDS =
  /\b(senior|sr|junior|jr|lead|principal|staff|intern(ship)?|entry[- ]level|associate|mid[- ]level|graduate|head of|chief|i{1,3}|iv|v|l[1-7])\b\.?/gi;

/** Title with seniority/level and trailing qualifiers removed, for dedup and grouping. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .split(/\s[-–|,]\s|\s@\s/)[0]!
    .replace(LEVEL_WORDS, ' ')
    .replace(/[^\p{L}\p{N}+#./ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** SHA-256(lower(trim(company)) | lower(trim(normalized_title)) | lower(trim(location))) */
export function dedupHash(companyName: string, normalizedTitle: string, location: string): string {
  const key = [companyName, normalizedTitle, location].map((s) => s.trim().toLowerCase()).join('|');
  return createHash('sha256').update(key).digest('hex');
}
