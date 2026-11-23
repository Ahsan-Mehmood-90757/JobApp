import { canonicalSkill, extractSkills, type Resume } from '@jobapp/shared';
import { totalYears } from './dates';

export interface AuditJob {
  title: string;
  coreSkills: string[];
  minYearsExperience: number | null;
  maxYearsExperience: number | null;
  description: string;
}

export interface BulletRecommendation {
  experienceId: string;
  bulletIndex: number;
  bullet: string;
  reasons: string[];
  /** Job terms related to this bullet that it doesn't use yet. */
  relatedJobTerms: string[];
}

export interface MatchAudit {
  /** 0–100 */
  score: number;
  skillScore: number;
  experienceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  /** Skills the resume lists but never backs up in a bullet or the summary. */
  unevidencedSkills: string[];
  resumeYears: number;
  requiredYears: number | null;
  /** Positive = years short of the requirement. */
  experienceGapYears: number;
  recommendations: BulletRecommendation[];
}

const STOP = new Set(
  ('about above after again against also among an and any are as at be been being both but by can could did do does doing during each ' +
    'for from further had has have having her here him his how into is it its just more most must need not now of off on once only or other our ' +
    'out over own same she should so some such than that the their them then there these they this those through to too under until up very was ' +
    'we were what when where which while who whom why will with within without would you your role team work working company experience years ' +
    'year strong ability including across help join looking new well using use used etc plus preferred required requirements responsibilities ' +
    'qualifications skills candidate opportunity position job apply benefits salary equal employer status').split(' '),
);

const tokens = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g)?.filter((t) => !STOP.has(t)) ?? [];

/** Frequent meaningful words in the job description (beyond the skills dictionary). */
export function jobKeywords(job: AuditJob, limit = 30): string[] {
  const counts = new Map<string, number>();
  for (const t of tokens(`${job.title} ${job.title} ${job.description}`)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
}

const IMPLIES: Record<string, string[]> = {
  postgresql: ['SQL'], mysql: ['SQL'], snowflake: ['SQL'], bigquery: ['SQL'], 'power bi': ['Data Analysis'],
  typescript: ['JavaScript'], 'react native': ['React', 'JavaScript'], 'next.js': ['React', 'JavaScript'],
  react: ['JavaScript'], 'node.js': ['JavaScript'], express: ['Node.js'], nestjs: ['Node.js'], fastify: ['Node.js'],
  django: ['Python'], flask: ['Python'], fastapi: ['Python'], pandas: ['Python'], 'spring boot': ['Java'],
  kubernetes: ['Docker'], 'github actions': ['CI/CD'], jenkins: ['CI/CD'], swiftui: ['Swift'], 'jetpack compose': ['Kotlin'],
  pytorch: ['Machine Learning'], tensorflow: ['Machine Learning'], 'scikit-learn': ['Machine Learning'],
};

/** Add skills implied by the ones given (PostgreSQL → SQL). */
export function withImpliedSkills(skills: string[]): string[] {
  const out = new Map(skills.map((s) => [s.toLowerCase(), s]));
  for (const s of skills) for (const i of IMPLIES[s.toLowerCase()] ?? []) out.set(i.toLowerCase(), i);
  return [...out.values()];
}

const HAS_METRIC = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozens?|hundreds?|thousands?|millions?|half|double[ds]?|tripled?)\b/i;

const WEAK_OPENERS = /^(responsible for|worked on|helped( to)?|assisted( in| with)?|involved in|tasked with|duties included|participated in|in charge of|handled)\b/i;

export function auditMatch(resume: Resume, job: AuditJob): MatchAudit {
  const prose = [resume.summary, ...resume.experience.flatMap((e) => [e.roleTitle, ...e.bullets])].join('\n');
  const evidenced = new Set(extractSkills(prose, 200).map((s) => s.toLowerCase()));
  const listed = new Set(resume.skills.map((s) => canonicalSkill(s).toLowerCase()));
  // Knowing a specific tool implies the general skill (PostgreSQL → SQL), never the reverse.
  for (const set of [evidenced, listed]) {
    for (const skill of [...set]) for (const implied of IMPLIES[skill] ?? []) set.add(implied.toLowerCase());
  }
  const has = (s: string) => evidenced.has(s.toLowerCase()) || listed.has(s.toLowerCase());

  // Job skills are ordered by frequency in the posting; the top ones matter most.
  const jobSkills = job.coreSkills.slice(0, 12);
  const matchedSkills = jobSkills.filter(has);
  const missingSkills = jobSkills.filter((s) => !has(s));
  const weights = jobSkills.map((_, i) => (i < 5 ? 2 : 1));
  const totalW = weights.reduce((a, b) => a + b, 0);
  const skillScore = totalW ? jobSkills.reduce((acc, s, i) => acc + (has(s) ? weights[i]! : 0), 0) / totalW : 1;

  const resumeYears = totalYears(resume.experience);
  const required = job.minYearsExperience;
  const experienceScore = required == null || required === 0 ? 1 : Math.min(1, resumeYears / required);
  const experienceGapYears = required == null ? 0 : Math.max(0, Math.round((required - resumeYears) * 10) / 10);

  const score = Math.round(100 * (jobSkills.length ? 0.7 * skillScore + 0.3 * experienceScore : experienceScore));

  const unevidencedSkills = resume.skills
    .map(canonicalSkill)
    .filter((s) => jobSkills.some((j) => j.toLowerCase() === s.toLowerCase()) && !evidenced.has(s.toLowerCase()));

  // Bullets worth tailoring: relevant to this job, but weakly phrased or not using its terms.
  const keywords = new Set([...jobKeywords(job), ...jobSkills.map((s) => s.toLowerCase())]);
  const recs: (BulletRecommendation & { relevance: number })[] = [];
  for (const exp of resume.experience) {
    exp.bullets.forEach((bullet, bulletIndex) => {
      const bt = new Set(tokens(bullet));
      const overlap = [...bt].filter((t) => keywords.has(t));
      const bulletSkills = extractSkills(bullet).map((s) => s.toLowerCase());
      const reasons: string[] = [];
      if (WEAK_OPENERS.test(bullet)) reasons.push('Starts with a weak phrase; lead with an action verb.');
      if (!HAS_METRIC.test(bullet)) reasons.push('No measurable result; add a number if you have one.');
      const relatedJobTerms = missingSkills.filter((s) => {
        // A missing skill is "related" when the bullet already touches the same area (shares a word).
        const sw = tokens(s);
        return sw.some((w) => bt.has(w));
      });
      if (overlap.length > 0 && bulletSkills.length === 0 && jobSkills.length) {
        reasons.push('Relevant to this job but names no specific tools; mention the ones you actually used.');
      }
      if (reasons.length === 0) return;
      recs.push({ experienceId: exp.id, bulletIndex, bullet, reasons, relatedJobTerms, relevance: overlap.length + bulletSkills.length * 2 + (WEAK_OPENERS.test(bullet) ? 3 : 0) });
    });
  }
  recs.sort((a, b) => b.relevance - a.relevance);

  return {
    score,
    skillScore: Math.round(skillScore * 100),
    experienceScore: Math.round(experienceScore * 100),
    matchedSkills,
    missingSkills,
    unevidencedSkills,
    resumeYears,
    requiredYears: required,
    experienceGapYears,
    recommendations: recs.slice(0, 6).map(({ relevance: _r, ...r }) => r),
  };
}
