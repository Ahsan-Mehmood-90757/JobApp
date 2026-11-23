import {
  canonicalSkill,
  emptyResume,
  extractSkills,
  parseLocation,
  toCountryCode,
  type Resume,
  type ResumeEducation,
  type ResumeExperience,
} from '@jobapp/shared';
import { findDateRange, SINGLE_DATE_RE } from './dates';

/**
 * Rule-based resume parser: plain text (from PDF or DOCX) → canonical resume JSON.
 * Handles the common single- and two-line entry layouts. It won't be perfect on heavily designed
 * resumes; the mobile editor exists to fix what it misses. An LLM parser can replace this later
 * behind the same function signature.
 */

type Section = 'header' | 'summary' | 'experience' | 'skills' | 'education' | 'other';

const HEADINGS: [RegExp, Section][] = [
  [/^(professional\s+)?(summary|profile|about( me)?|objective|career (objective|summary)|overview)$/, 'summary'],
  [/^((work|professional|relevant|employment)\s+)?(experience|history|employment)( history)?$|^work$|^career history$/, 'experience'],
  [/^((technical|core|key|relevant)\s+)?(skills|competencies|technologies|expertise|tech stack|tools)( (&|and) (tools|technologies|expertise))?$/, 'skills'],
  [/^(education|academic background|academics|qualifications|education (&|and) (training|certifications))$/, 'education'],
  [/^(projects|personal projects|certifications?|licenses|awards|honors|publications|languages|volunteer(ing| experience)?|interests|hobbies|references|activities|leadership|achievements)$/, 'other'],
];

const BULLET_RE = /^\s*(?:[•●▪◦‣∙·○■□➢►▶✓✔*–-]|\d{1,2}[.)])\s+/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{3,4})?/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?(?:github\.com\/[\w-]+|[a-z0-9-]+\.(?:dev|io|me|com|net|org|app|site|xyz|co)(?:\/[\w./-]*)?)/i;
const ROLE_WORDS =
  /\b(engineer|developer|manager|analyst|designer|intern|lead|consultant|specialist|director|scientist|architect|officer|associate|coordinator|administrator|programmer|technician|founder|co-founder|head|vp|president|assistant|representative|executive|strategist|researcher|teacher|accountant|marketer|writer|editor|owner|contractor|freelancer?)\b/i;
const DEGREE_RE =
  /\b(b\.?\s?s\.?c?|b\.?\s?a\.?|b\.?\s?eng|b\.?\s?tech|b\.?\s?e\.?|bachelor'?s?|m\.?\s?s\.?c?|m\.?\s?a\.?|m\.?\s?eng|m\.?\s?tech|master'?s?|mba|ph\.?\s?d|doctorate|associate'?s?|diploma|certificate|high school|a-?levels?|bs|ba|ms|ma|bsc|msc|bba)\b/i;
const INSTITUTION_RE = /\b(university|college|institute|school|academy|polytechnic|universit[éäa])\b/i;

function headingOf(line: string): Section | null {
  const t = line.trim();
  if (t.length === 0 || t.length > 45 || BULLET_RE.test(t)) return null;
  const norm = t.toLowerCase().replace(/[:|•\-–—_=*#]+$/g, '').replace(/^[#*\s]+/, '').replace(/\s+/g, ' ').trim();
  for (const [re, section] of HEADINGS) if (re.test(norm)) return section;
  return null;
}

function cleanLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .replace(/[•]/g, '•') // Word/PDF private-use bullet glyphs
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0 && !/^(page \d+( of \d+)?|-- \d+ of \d+ --|\d{1,3})$/i.test(l));
}

function splitSections(lines: string[]): Record<Section, string[]> {
  const out: Record<Section, string[]> = { header: [], summary: [], experience: [], skills: [], education: [], other: [] };
  let current: Section = 'header';
  for (const line of lines) {
    const h = headingOf(line);
    if (h) {
      current = h;
      continue;
    }
    // "Skills: TypeScript, React" on one line
    const inline = /^([A-Za-z ]{3,30}):\s+(.+)$/.exec(line);
    const inlineSection = inline ? headingOf(inline[1]!) : null;
    // Inside Skills, "Languages: ..." / "Tools: ..." are skill categories, not new sections.
    if (inlineSection && inlineSection !== 'header' && current !== 'skills') {
      out[inlineSection].push(inline![2]!);
      continue;
    }
    out[current].push(line);
  }
  return out;
}

// ---------------------------------------------------------------- contact
function parseContact(header: string[], allLines: string[]): Resume['contact'] {
  const contact = emptyResume().contact;
  const scan = [...header, ...allLines.slice(0, 15)].join('\n');
  contact.email = EMAIL_RE.exec(scan)?.[0] ?? '';
  const li = LINKEDIN_RE.exec(scan)?.[0];
  if (li) contact.linkedinUrl = li.startsWith('http') ? li : `https://${li}`;
  const scanNoUrls = scan.replace(new RegExp(LINKEDIN_RE, 'gi'), ' ').replace(new RegExp(EMAIL_RE, 'g'), ' ');
  const portfolio = URL_RE.exec(scanNoUrls)?.[0];
  if (portfolio) contact.portfolioUrl = portfolio.startsWith('http') ? portfolio : `https://${portfolio}`;
  for (const m of scanNoUrls.matchAll(new RegExp(PHONE_RE, 'g'))) {
    const digits = m[0].replace(/\D/g, '');
    // Skip date ranges like "2019 - 2021"
    if (digits.length >= 9 && digits.length <= 15 && !/^(19|20)\d{2}(19|20)\d{2}$/.test(digits)) {
      contact.phone = m[0].trim();
      break;
    }
  }

  const headerLines = header.length ? header : allLines.slice(0, 6);
  for (const line of headerLines.slice(0, 5)) {
    const stripped = line.replace(EMAIL_RE, '').replace(LINKEDIN_RE, '').trim();
    const words = stripped.split(/\s+/);
    if (
      words.length >= 2 && words.length <= 5 &&
      /^[\p{L}][\p{L}'.-]*(\s[\p{L}][\p{L}'.-]*)+$/u.test(stripped) &&
      !ROLE_WORDS.test(stripped) && !headingOf(stripped)
    ) {
      contact.fullName = stripped.replace(/\b\p{L}+/gu, (w) => (w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w));
      break;
    }
  }

  // Location: a header fragment (split on | • ·) that parses as a place.
  outer: for (const line of headerLines) {
    for (const frag of line.split(/\s*[|•·]\s*|\s{2,}/)) {
      if (EMAIL_RE.test(frag) || frag.replace(/\D/g, '').length >= 7 || URL_RE.test(frag) || LINKEDIN_RE.test(frag)) continue;
      const loc = parseLocation(frag);
      if ((loc.countryCode || loc.region) && frag.length <= 50 && frag !== contact.fullName) {
        contact.location = frag.trim();
        break outer;
      }
    }
  }
  return contact;
}

// ---------------------------------------------------------------- experience
function splitHeaderPieces(text: string, splitOnAt = true): string[] {
  const re = splitOnAt
    ? /\s*(?:\||•|·|—|–|\s-\s|,\s(?=[A-Z])|\s@\s|\bat\b(?=\s+[A-Z]))\s*/
    : /\s*(?:\||•|·|—|–|\s-\s|,\s(?=[A-Z])|\s@\s)\s*/;
  return text
    .split(re)
    .map((p) => p.replace(/^[,;:()\s]+|[,;:()\s]+$/g, '').trim())
    .filter(Boolean);
}

function looksLikeLocation(piece: string): boolean {
  if (/^(remote|hybrid|on-?site)$/i.test(piece)) return true;
  const loc = parseLocation(piece);
  return Boolean(loc.countryCode || loc.region || loc.mentionsRemote) && piece.split(' ').length <= 5;
}

function buildEntryHeader(headerLines: string[], dateMatch: string): Pick<ResumeExperience, 'roleTitle' | 'company' | 'location'> {
  const pieces = headerLines.flatMap((l) => splitHeaderPieces(l.replace(dateMatch, ' ')));
  let location = '';
  const rest: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    let p = pieces[i]!;
    // Re-join "Austin" + "TX" / "Lahore" + "Pakistan" that the comma split separated.
    const next = pieces[i + 1];
    if (!location && next && (/^[A-Z]{2}$/.test(next) || toCountryCode(next)) && looksLikeLocation(`${p}, ${next}`) && !ROLE_WORDS.test(p)) {
      p = `${p}, ${next}`;
      i++;
    }
    if (!location && looksLikeLocation(p)) location = p;
    else if (!SINGLE_DATE_RE.test(p) || p.replace(SINGLE_DATE_RE, '').trim().length > 3) rest.push(p);
  }
  const roleIdx = rest.findIndex((p) => ROLE_WORDS.test(p));
  let roleTitle = '';
  let company = '';
  if (roleIdx >= 0) {
    roleTitle = rest[roleIdx]!;
    company = rest.find((_, i) => i !== roleIdx) ?? '';
  } else {
    [roleTitle = '', company = ''] = rest;
  }
  return { roleTitle, company, location };
}

function parseExperience(lines: string[]): ResumeExperience[] {
  const dateIdx = lines.map((l, i) => (findDateRange(l) && !BULLET_RE.test(l) ? i : -1)).filter((i) => i >= 0);
  if (dateIdx.length === 0) {
    const bullets = collectBullets(lines);
    return bullets.length ? [{ id: 'exp_1', roleTitle: '', company: '', location: '', startDate: '', endDate: '', bullets }] : [];
  }

  const entries: ResumeExperience[] = [];
  let consumedUntil = 0; // first line index not yet assigned to an entry
  dateIdx.forEach((di, n) => {
    const range = findDateRange(lines[di]!)!;
    // Header lines: non-bullet lines directly above the date line (max 2), after previous entry's body.
    const above: string[] = [];
    for (let i = di - 1; i >= consumedUntil && above.length < 2; i--) {
      const l = lines[i]!;
      if (BULLET_RE.test(l) || l.length > 90 || /[.;]$/.test(l)) break;
      above.unshift(l);
    }
    // Header lines directly below the date line (max 2) until the first bullet / sentence.
    const nextDate = dateIdx[n + 1] ?? lines.length;
    let bodyStart = di + 1;
    const below: string[] = [];
    while (bodyStart < nextDate && below.length < 2) {
      const l = lines[bodyStart]!;
      if (BULLET_RE.test(l) || l.length > 70 || /[.;]$/.test(l)) break;
      // Stop if this line looks like the next entry's header (lines right before the next date).
      if (n + 1 < dateIdx.length && bodyStart >= nextDate - 2 && !BULLET_RE.test(lines[bodyStart + 1] ?? '')) break;
      below.push(l);
      bodyStart++;
    }
    // Body runs until the next entry's header lines.
    let bodyEnd = nextDate;
    if (n + 1 < dateIdx.length) {
      for (let k = 0; k < 2 && bodyEnd - 1 > bodyStart; k++) {
        const l = lines[bodyEnd - 1]!;
        if (BULLET_RE.test(l) || l.length > 90 || /[.;]$/.test(l)) break;
        bodyEnd--;
      }
    }
    const header = buildEntryHeader([...above, lines[di]!, ...below], range.match);
    entries.push({
      id: `exp_${entries.length + 1}`,
      ...header,
      startDate: range.start,
      endDate: range.end,
      bullets: collectBullets(lines.slice(bodyStart, bodyEnd)),
    });
    consumedUntil = bodyEnd;
  });
  return entries;
}

/** Bullets: marker lines, with wrapped continuation lines joined back on. */
function collectBullets(lines: string[]): string[] {
  const bullets: string[] = [];
  for (const raw of lines) {
    const isBullet = BULLET_RE.test(raw);
    const text = raw.replace(BULLET_RE, '').trim();
    if (!text) continue;
    const prev = bullets[bullets.length - 1];
    const continues = !isBullet && prev !== undefined && (/^[a-z(&,]/.test(text) || !/[.!?]$/.test(prev));
    if (continues) bullets[bullets.length - 1] = `${prev} ${text}`;
    else bullets.push(text);
  }
  return bullets.map((b) => b.replace(/\s+/g, ' ').trim()).filter((b) => b.length > 2);
}

// ---------------------------------------------------------------- skills
function parseSkills(lines: string[], fullText: string): string[] {
  const out = new Map<string, string>();
  for (const line of lines) {
    // Drop category labels: "Languages: TypeScript, Go"
    const body = line.replace(BULLET_RE, '').replace(/^[A-Za-z &/]{2,30}:\s*/, '');
    for (const piece of body.split(/\s*(?:,|•|·|\||;|\s\/\s|\t)\s*/)) {
      const t = piece.replace(/^(and|&)\s+/i, '').replace(/[.]$/, '').trim();
      if (t.length < 1 || t.length > 40 || t.split(' ').length > 4) continue;
      const canon = canonicalSkill(t);
      out.set(canon.toLowerCase(), canon);
    }
  }
  if (out.size === 0) for (const s of extractSkills(fullText, 30)) out.set(s.toLowerCase(), s);
  return [...out.values()];
}

// ---------------------------------------------------------------- education
function parseEducation(lines: string[]): ResumeEducation[] {
  const entries: ResumeEducation[] = [];
  let cur: ResumeEducation | null = null;
  const push = () => {
    if (cur && (cur.degree || cur.institution)) entries.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.replace(BULLET_RE, '').trim();
    const year = [...line.matchAll(/\b((?:19|20)\d{2})\b/g)].map((m) => m[1]!).pop() ?? '';
    const pieces = splitHeaderPieces(line.replace(/\(?\b(?:19|20)\d{2}\b\s*(?:-|–|to)?\s*\)?/g, ' '), false);
    const degreePiece = pieces.find((p) => DEGREE_RE.test(p) && !INSTITUTION_RE.test(p));
    const instPiece = pieces.find((p) => INSTITUTION_RE.test(p));
    if (!degreePiece && !instPiece) {
      if (cur && year && !cur.graduationYear) cur.graduationYear = year;
      continue;
    }
    // A new entry starts when the slot we'd fill is already taken.
    const c = cur as ResumeEducation | null;
    if (!c || (degreePiece && c.degree) || (instPiece && c.institution && !degreePiece)) {
      push();
      cur = { id: `edu_${entries.length + 1}`, degree: '', institution: '', graduationYear: '' };
    }
    const e = cur as unknown as ResumeEducation;
    if (degreePiece) e.degree = degreePiece;
    if (instPiece) e.institution = instPiece;
    if (year) e.graduationYear = year;
  }
  push();
  return entries.map((e, i) => ({ ...e, id: `edu_${i + 1}` }));
}

// ---------------------------------------------------------------- main
export function parseResumeText(text: string): Resume {
  const lines = cleanLines(text);
  const sections = splitSections(lines);
  const resume = emptyResume();
  resume.contact = parseContact(sections.header, lines);

  let summaryLines = sections.summary;
  if (summaryLines.length === 0) {
    // No heading: use the prose paragraph in the header, if any.
    summaryLines = sections.header.filter((l) => l.length > 60 && !EMAIL_RE.test(l) && !URL_RE.test(l));
  }
  resume.summary = summaryLines.join(' ').replace(/\s+/g, ' ').trim();
  resume.experience = parseExperience(sections.experience);
  resume.skills = parseSkills(sections.skills, lines.join('\n'));
  resume.education = parseEducation(sections.education);
  return resume;
}
