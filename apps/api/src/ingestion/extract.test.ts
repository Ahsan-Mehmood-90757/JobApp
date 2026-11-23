import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSkills, parseLocation } from '@jobapp/shared';
import { dedupHash, htmlToText, normalizeTitle } from '../lib/text';
import { detectWorkArrangement, extractExperience, extractYears } from './extract';
import { redirectedAwayFromPosting } from './sweep';

test('extractYears picks up common phrasings', () => {
  assert.deepEqual(extractYears('You have 3+ years of experience with React.'), { min: 3, max: null });
  assert.deepEqual(extractYears('Requires 5-7 years experience in backend systems'), { min: 5, max: 7 });
  assert.deepEqual(extractYears('At least two years of professional experience'), { min: 2, max: null });
  assert.deepEqual(extractYears('Minimum of 4 years working in data analytics'), { min: 4, max: null });
  // Largest headline requirement wins
  assert.equal(extractYears('6+ years of software experience, including 2+ years with Go.')?.min, 6);
});

test('extractYears ignores non-experience numbers', () => {
  assert.equal(extractYears('We were founded 10 years ago and have grown every year.'), null);
  assert.equal(extractYears('Our 4 year vesting schedule is generous.'), null);
  assert.equal(extractYears('No requirements listed.'), null);
});

test('extractExperience prefers source data, then text, then title', () => {
  assert.deepEqual(extractExperience({ title: 'Engineer', description: '5+ years experience', sourceMinYears: 2 }).minYears, 2);
  const fromText = extractExperience({ title: 'Engineer', description: '5+ years of experience' });
  assert.equal(fromText.minYears, 5);
  assert.equal(fromText.source, 'heuristic');
  assert.equal(fromText.seniority, 'senior');
  const inferred = extractExperience({ title: 'Senior Backend Engineer', description: 'Build things.' });
  assert.equal(inferred.source, 'inferred');
  assert.equal(inferred.minYears, 5);
  assert.equal(extractExperience({ title: 'Software Engineering Intern', description: '' }).seniority, 'entry');
  assert.notEqual(extractExperience({ title: 'Product Manager', description: '' }).seniority, 'lead');
  assert.equal(extractExperience({ title: 'Engineering Manager, Payments', description: '' }).seniority, 'lead');
});

test('detectWorkArrangement', () => {
  const base = { title: 'Engineer', location: '', description: '' };
  assert.equal(detectWorkArrangement({ ...base, explicit: 'hybrid' }), 'hybrid');
  assert.equal(detectWorkArrangement({ ...base, location: 'Remote - US' }), 'remote');
  assert.equal(detectWorkArrangement({ ...base, location: 'London (Hybrid)' }), 'hybrid');
  assert.equal(detectWorkArrangement({ ...base, isRemoteFlag: true, description: 'This is a hybrid role in Austin' }), 'hybrid');
  assert.equal(detectWorkArrangement({ ...base, description: 'Expect 3 days per week in the office.' }), 'hybrid');
  assert.equal(detectWorkArrangement({ ...base, location: 'Berlin, Germany' }), 'onsite');
});

test('parseLocation', () => {
  assert.deepEqual(
    { ...parseLocation('San Francisco, CA') },
    { city: 'San Francisco', region: 'CA', countryCode: 'US', mentionsRemote: false, mentionsHybrid: false },
  );
  assert.equal(parseLocation('London, England, United Kingdom').countryCode, 'GB');
  assert.equal(parseLocation('London, England, United Kingdom').city, 'London');
  const remote = parseLocation('Remote - US');
  assert.equal(remote.countryCode, 'US');
  assert.equal(remote.city, null);
  assert.equal(remote.mentionsRemote, true);
  assert.equal(parseLocation('Dubai').countryCode, 'AE');
  assert.equal(parseLocation('Hybrid (Berlin)').city, 'Berlin');
  assert.equal(parseLocation('Remote, EMEA').city, null);
  assert.equal(parseLocation('Toronto, ON').countryCode, 'CA');
  assert.equal(parseLocation('Berlin, DE').countryCode, 'DE');
  assert.deepEqual([parseLocation('N/A').city, parseLocation('LOCATION').city, parseLocation('AMER').city], [null, null, null]);
  assert.equal(parseLocation('SF, SEA, NYC').city, 'San Francisco');
  assert.equal(parseLocation('US-NYC').city, 'New York');
  assert.equal(parseLocation('New York City, NY').city, 'New York');
  assert.equal(parseLocation('Singapore').city, 'Singapore');
  assert.deepEqual([parseLocation('US-San Francisco, US-New York').city, parseLocation('US-San Francisco, US-New York').countryCode], ['San Francisco', 'US']);
  assert.equal(parseLocation('Remote in the US').countryCode, 'US');
  assert.equal(parseLocation('Remote in the US').city, null);
  assert.equal(parseLocation('Indianapolis, IN').countryCode, 'US');
});

test('extractSkills handles symbols and avoids false positives', () => {
  const skills = extractSkills('We use TypeScript, Node.js, PostgreSQL and C++. Experience with k8s and AWS a plus. Go to our site.');
  for (const s of ['TypeScript', 'Node.js', 'PostgreSQL', 'C++', 'Kubernetes', 'AWS']) assert.ok(skills.includes(s), s);
  assert.ok(!skills.includes('Go'), 'lowercase "go" in a sentence is not Golang');
  assert.ok(!skills.includes('C'));
});

test('text helpers', () => {
  assert.equal(htmlToText('&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;/ul&gt;'), 'Hello & welcome\n\n• One');
  assert.equal(normalizeTitle('Senior Software Engineer (Payments) - Remote'), 'software engineer');
  assert.equal(normalizeTitle('Sr. Data Analyst II'), 'data analyst');
  assert.equal(dedupHash(' Acme ', 'software engineer', 'NYC'), dedupHash('acme', 'Software Engineer', 'nyc '));
});

test('redirectedAwayFromPosting', () => {
  assert.equal(redirectedAwayFromPosting('https://boards.greenhouse.io/stripe/jobs/1234567', 'https://stripe.com/careers/search'), true);
  assert.equal(redirectedAwayFromPosting('https://jobs.lever.co/x/1a2b3c4d-1111-2222', 'https://jobs.lever.co/x?error=true'), true);
  assert.equal(redirectedAwayFromPosting('https://boards.greenhouse.io/stripe/jobs/1234567', 'https://stripe.com/jobs/listing/x/1234567'), false);
  assert.equal(redirectedAwayFromPosting('https://a.com/job/1234567', 'https://a.com/job/1234567'), false);
  assert.equal(redirectedAwayFromPosting('https://stripe.com/jobs/search?gh_jid=8215824', 'https://stripe.com/careers/search?gh_jid=8215824'), false);
  assert.equal(redirectedAwayFromPosting('https://stripe.com/jobs/search?gh_jid=8215824', 'https://stripe.com/careers/search'), true);
});
