import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeDate, totalYears } from './dates';
import { parseResumeText } from './parse';

const SINGLE_LINE_LAYOUT = `
JANE DOE
Austin, TX | jane.doe@example.com | (512) 555-0134 | linkedin.com/in/janedoe | github.com/janedoe

SUMMARY
Full-stack engineer with 5 years building TypeScript and React Native products for fintech.

EXPERIENCE
Senior Software Engineer | Acme Corp | Remote | Jan 2022 – Present
• Led migration of payments API to Node.js and PostgreSQL, cutting p95 latency 40%.
• Mentored 4 engineers and introduced code review
  guidelines adopted across the org.
Software Engineer | Beta Inc | Austin, TX | Jun 2019 - Dec 2021
• Built React Native app used by 200k monthly users.
• Responsible for CI/CD pipelines on GitHub Actions.

SKILLS
Languages: TypeScript, JavaScript, Python, SQL
Frameworks: React, React Native, Node.js, Express
Tools: Docker, AWS, Postgres

EDUCATION
B.S. Computer Science, University of Texas at Austin, 2019
`;

const TWO_LINE_LAYOUT = `
Ali Khan
ali.khan@mail.com
+92 300 1234567
Lahore, Pakistan

Professional Experience
Data Analyst
Finz Technologies, Lahore
03/2021 - Present
- Built Power BI dashboards tracking loan portfolio KPIs for leadership.
- Automated weekly reporting with Python and Pandas, saving 6 hours per week.

Junior Analyst
Retail Co
2019 - 2021
- Cleaned sales data in Excel and SQL.

Education
Bachelor of Business Administration
Lahore University of Management Sciences
2019

Technical Skills
Python • SQL • Power BI • Excel • Tableau
`;

test('dates', () => {
  assert.equal(normalizeDate('Jan 2022'), '2022-01');
  assert.equal(normalizeDate('September, 2019'), '2019-09');
  assert.equal(normalizeDate('03/2021'), '2021-03');
  assert.equal(normalizeDate('2019'), '2019');
  assert.equal(normalizeDate('Present'), 'Present');
  const now = new Date('2026-01-15');
  assert.equal(totalYears([{ startDate: '2020-01', endDate: '2021-12' }], now), 2);
  // Overlapping roles are not double counted
  assert.equal(totalYears([{ startDate: '2020-01', endDate: '2021-12' }, { startDate: '2021-01', endDate: '2022-12' }], now), 3);
});

test('single-line layout', () => {
  const r = parseResumeText(SINGLE_LINE_LAYOUT);
  assert.equal(r.contact.fullName, 'Jane Doe');
  assert.equal(r.contact.email, 'jane.doe@example.com');
  assert.equal(r.contact.phone, '(512) 555-0134');
  assert.equal(r.contact.location, 'Austin, TX');
  assert.equal(r.contact.linkedinUrl, 'https://linkedin.com/in/janedoe');
  assert.equal(r.contact.portfolioUrl, 'https://github.com/janedoe');
  assert.match(r.summary, /^Full-stack engineer/);

  assert.equal(r.experience.length, 2);
  const [a, b] = r.experience;
  assert.equal(a!.roleTitle, 'Senior Software Engineer');
  assert.equal(a!.company, 'Acme Corp');
  assert.equal(a!.location, 'Remote');
  assert.equal(a!.startDate, '2022-01');
  assert.equal(a!.endDate, 'Present');
  assert.equal(a!.bullets.length, 2);
  assert.match(a!.bullets[1]!, /guidelines adopted across the org\.$/, 'wrapped line is joined');
  assert.equal(b!.company, 'Beta Inc');
  assert.equal(b!.location, 'Austin, TX');
  assert.equal(b!.endDate, '2021-12');

  for (const s of ['TypeScript', 'React Native', 'Node.js', 'PostgreSQL', 'Docker']) assert.ok(r.skills.includes(s), s);
  assert.ok(!r.skills.some((s) => s.includes(':')));

  assert.equal(r.education.length, 1);
  assert.equal(r.education[0]!.degree, 'B.S. Computer Science');
  assert.equal(r.education[0]!.institution, 'University of Texas at Austin');
  assert.equal(r.education[0]!.graduationYear, '2019');
});

test('two-line layout', () => {
  const r = parseResumeText(TWO_LINE_LAYOUT);
  assert.equal(r.contact.fullName, 'Ali Khan');
  assert.equal(r.contact.phone, '+92 300 1234567');
  assert.equal(r.contact.location, 'Lahore, Pakistan');

  assert.equal(r.experience.length, 2);
  const [a, b] = r.experience;
  assert.equal(a!.roleTitle, 'Data Analyst');
  assert.equal(a!.company, 'Finz Technologies');
  assert.equal(a!.location, 'Lahore');
  assert.equal(a!.startDate, '2021-03');
  assert.equal(a!.bullets.length, 2);
  assert.equal(b!.roleTitle, 'Junior Analyst');
  assert.equal(b!.company, 'Retail Co');
  assert.equal(b!.bullets.length, 1);

  assert.deepEqual(r.skills, ['Python', 'SQL', 'Power BI', 'Excel', 'Tableau']);
  assert.equal(r.education[0]!.degree, 'Bachelor of Business Administration');
  assert.equal(r.education[0]!.institution, 'Lahore University of Management Sciences');
  assert.equal(r.education[0]!.graduationYear, '2019');
});
