import { findSkillMentions } from '@jobapp/shared';

export interface TailorInput {
  text: string;
  job: { title: string; coreSkills: string[]; description: string };
  /** Skills the user's resume already shows, so suggestions stay truthful. */
  resumeSkills: string[];
}

export interface TailorResult {
  original: string;
  suggestion: string;
  /** Human-readable list of what changed and why. */
  changes: string[];
  /** Job skills absent from the resume: shown to the user, never inserted automatically. */
  considerIfTrue: string[];
  mode: 'rules' | 'llm';
}

/**
 * Anything that can rewrite a bullet. The rules engine below needs no API key; an LLM-backed
 * implementation can be dropped in later with the same contract (and must keep the same
 * truthfulness guarantee: no new employers, degrees, dates, numbers or tools).
 */
export interface BulletTailorer {
  tailor(input: TailorInput): Promise<TailorResult>;
}

// Gerund → past tense for common resume verbs.
const PAST: Record<string, string> = {
  building: 'Built', leading: 'Led', running: 'Ran', writing: 'Wrote', making: 'Made', managing: 'Managed',
  developing: 'Developed', designing: 'Designed', creating: 'Created', maintaining: 'Maintained',
  implementing: 'Implemented', improving: 'Improved', optimizing: 'Optimized', testing: 'Tested',
  deploying: 'Deployed', automating: 'Automated', analyzing: 'Analyzed', analysing: 'Analysed',
  coordinating: 'Coordinated', supporting: 'Supported', planning: 'Planned', owning: 'Owned',
  delivering: 'Delivered', launching: 'Launched', migrating: 'Migrated', integrating: 'Integrated',
  monitoring: 'Monitored', reporting: 'Reported', training: 'Trained', mentoring: 'Mentored',
  overseeing: 'Oversaw', handling: 'Handled', preparing: 'Prepared', reviewing: 'Reviewed',
  researching: 'Researched', drafting: 'Drafted', establishing: 'Established', defining: 'Defined',
  driving: 'Drove', setting: 'Set up', conducting: 'Conducted', resolving: 'Resolved',
  troubleshooting: 'Troubleshot', configuring: 'Configured', documenting: 'Documented', scaling: 'Scaled',
  refactoring: 'Refactored', architecting: 'Architected', streamlining: 'Streamlined', negotiating: 'Negotiated',
  selling: 'Sold', growing: 'Grew', hiring: 'Hired', teaching: 'Taught', organizing: 'Organized',
  executing: 'Executed', producing: 'Produced', processing: 'Processed', tracking: 'Tracked',
};

interface Rule {
  re: RegExp;
  apply: (m: RegExpExecArray, rest: string) => { text: string; note: string } | null;
}

function gerundToPast(rest: string): { text: string; verb: string } | null {
  const m = /^(the\s+)?([a-z]+ing)\b\s*(.*)$/i.exec(rest);
  if (!m) return null;
  const past = PAST[m[2]!.toLowerCase()];
  if (!past) return null;
  return { text: `${past} ${m[3]}`.trim(), verb: past };
}

const RULES: Rule[] = [
  {
    // "Responsible for building X" → "Built X"; "Responsible for the X" → "Owned the X"
    re: /^(?:was\s+)?(?:responsible for|in charge of|tasked with|duties included)\s+/i,
    apply: (_m, rest) => {
      const g = gerundToPast(rest);
      if (g) return { text: g.text, note: `Replaced a passive opener with the action verb "${g.verb}".` };
      return { text: `Owned ${rest}`, note: 'Replaced "Responsible for" with "Owned".' };
    },
  },
  {
    // "Worked on / Involved in / Participated in X"
    re: /^(?:worked on|involved in|participated in)\s+/i,
    apply: (_m, rest) => {
      const g = gerundToPast(rest);
      if (g) return { text: g.text, note: `Led with the action verb "${g.verb}".` };
      return { text: `Contributed to ${rest}`, note: 'Replaced a vague opener with "Contributed to".' };
    },
  },
  {
    // "Assisted with building X" → "Contributed to building X"; "Assisted with X" → "Supported X".
    // "Helped to build X" is already honest and clear, so leave it.
    re: /^assisted\s+(?:in|with)\s+/i,
    apply: (_m, rest) =>
      /^[a-z]+ing\b/i.test(rest)
        ? { text: `Contributed to ${rest}`, note: 'Replaced "Assisted with" with "Contributed to".' }
        : { text: `Supported ${rest}`, note: 'Replaced "Assisted with" with "Supported".' },
  },
  {
    // Gerund start: "Building dashboards for..." → "Built dashboards for..."
    re: /^(?=[a-z]+ing\b)/i,
    apply: (_m, rest) => {
      const g = gerundToPast(rest);
      return g ? { text: g.text, note: `Switched to past-tense "${g.verb}" for consistency.` } : null;
    },
  },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class RulesTailorer implements BulletTailorer {
  async tailor(input: TailorInput): Promise<TailorResult> {
    const original = input.text.trim();
    let text = original;
    const changes: string[] = [];

    for (const rule of RULES) {
      const m = rule.re.exec(text);
      if (!m) continue;
      const res = rule.apply(m, text.slice(m[0].length));
      if (res && res.text !== text) {
        text = res.text;
        if (res.note) changes.push(res.note);
        break;
      }
    }

    // Use the job's exact name for tools the bullet already mentions ("Postgres" → "PostgreSQL").
    const jobSkills = new Map(input.job.coreSkills.map((s) => [s.toLowerCase(), s]));
    for (const mention of findSkillMentions(text).reverse()) {
      const jobName = jobSkills.get(mention.skill.toLowerCase());
      if (jobName && mention.text !== jobName) {
        text = text.slice(0, mention.index) + jobName + text.slice(mention.index + mention.text.length);
        changes.push(`Used the posting's wording "${jobName}" instead of "${mention.text}".`);
      }
    }

    text = text.replace(/\s+/g, ' ').trim();
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
    if (/[.]$/.test(original) && !/[.!?]$/.test(text)) text += '.';
    if (!/\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozens?|hundreds?|thousands?|millions?)\b/i.test(text)) changes.push('Tip: add a measurable result (%, $, users, time saved) if you have a real one.');

    const resumeSkills = new Set(input.resumeSkills.map((s) => s.toLowerCase()));
    const inBullet = new Set(findSkillMentions(text).map((m) => m.skill.toLowerCase()));
    const considerIfTrue = input.job.coreSkills
      .slice(0, 10)
      .filter((s) => !resumeSkills.has(s.toLowerCase()) && !inBullet.has(s.toLowerCase()))
      .slice(0, 5);

    if (text === original && changes.every((c) => c.startsWith('Tip'))) {
      changes.unshift('Already clear and action-led; no wording change needed.');
    }
    // Sanity: rules must never introduce a number that wasn't there.
    for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? []) {
      if (!new RegExp(escapeRe(n)).test(original)) throw new Error('tailor rule introduced a new number');
    }
    return { original, suggestion: text, changes, considerIfTrue, mode: 'rules' };
  }
}

export function getTailorer(): BulletTailorer {
  return new RulesTailorer();
}
