import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Resume } from '@jobapp/shared';
import { auditMatch } from './match';
import { RulesTailorer } from './tailor';

const resume: Resume = {
  contact: { fullName: 'Jane Doe', email: '', phone: '', location: '', linkedinUrl: '', portfolioUrl: '' },
  summary: 'Backend engineer focused on payments.',
  experience: [
    {
      id: 'exp_1', roleTitle: 'Software Engineer', company: 'Acme', location: 'Remote', startDate: '2021-01', endDate: '2023-12',
      bullets: [
        'Responsible for building payment APIs in Node.js and Postgres.',
        'Cut checkout latency 35% by adding Redis caching.',
        'Worked on the onboarding flow for merchants.',
      ],
    },
  ],
  skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis', 'Docker'],
  education: [],
};

const job = {
  title: 'Backend Engineer, Payments',
  coreSkills: ['PostgreSQL', 'Node.js', 'Kafka', 'TypeScript', 'AWS', 'Redis'],
  minYearsExperience: 4,
  maxYearsExperience: null,
  description: 'Build payment APIs and merchant onboarding. Payments experience required. Kafka and AWS a plus.',
};

test('auditMatch scores skills and experience', () => {
  const a = auditMatch(resume, job);
  assert.deepEqual(a.matchedSkills.sort(), ['Node.js', 'PostgreSQL', 'Redis', 'TypeScript']);
  assert.deepEqual(a.missingSkills.sort(), ['AWS', 'Kafka']);
  assert.equal(a.resumeYears, 3);
  assert.equal(a.experienceGapYears, 1);
  assert.equal(a.experienceScore, 75);
  assert.ok(a.score > 50 && a.score < 90, String(a.score));
  assert.ok(a.unevidencedSkills.includes('TypeScript'), 'listed but never used in a bullet');
  const weak = a.recommendations.find((r) => r.bulletIndex === 0);
  assert.ok(weak?.reasons.some((r) => r.includes('weak phrase')));
  assert.ok(!a.recommendations.some((r) => r.bulletIndex === 1), 'strong bullet with a metric is not flagged');
  const sql = auditMatch(resume, { ...job, coreSkills: ['SQL', 'JavaScript'] });
  assert.deepEqual(sql.missingSkills, [], 'PostgreSQL implies SQL, Node.js implies JavaScript');
});

test('rules tailor: action verbs and job wording, never new facts', async () => {
  const t = new RulesTailorer();
  const r1 = await t.tailor({ text: resume.experience[0]!.bullets[0]!, job, resumeSkills: resume.skills });
  assert.equal(r1.suggestion, 'Built payment APIs in Node.js and PostgreSQL.');
  assert.ok(r1.changes.some((c) => c.includes('"PostgreSQL" instead of "Postgres"')));
  assert.deepEqual(r1.considerIfTrue, ['Kafka', 'AWS']);

  const r2 = await t.tailor({ text: 'Worked on the onboarding flow for merchants.', job, resumeSkills: resume.skills });
  assert.equal(r2.suggestion, 'Contributed to the onboarding flow for merchants.');

  const r3 = await t.tailor({ text: 'Cut checkout latency 35% by adding Redis caching.', job, resumeSkills: resume.skills });
  assert.equal(r3.suggestion, r3.original);
  assert.match(r3.changes[0]!, /no wording change/);

  const r4 = await t.tailor({ text: 'assisted with migrating k8s clusters', job: { ...job, coreSkills: ['Kubernetes'] }, resumeSkills: [] });
  assert.equal(r4.suggestion, 'Contributed to migrating Kubernetes clusters');
});
