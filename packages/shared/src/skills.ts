/**
 * Skills dictionary used for deterministic skill extraction from job descriptions and resumes.
 * Key = canonical display name, value = extra aliases (case-insensitive, whole-word).
 * Extend freely; matching is shared by ingestion and the resume match audit.
 */
const SKILLS: Record<string, string[]> = {
  // Languages
  JavaScript: ['js', 'ecmascript'],
  TypeScript: ['ts'],
  Python: [],
  Java: [],
  Kotlin: [],
  Swift: [],
  'Objective-C': ['objective c', 'objc'],
  Go: ['golang'],
  Rust: [],
  'C++': ['cpp'],
  'C#': ['c sharp', 'csharp'],
  C: [],
  Ruby: [],
  PHP: [],
  Scala: [],
  Elixir: [],
  Dart: [],
  R: [],
  SQL: [],
  Bash: ['shell scripting'],
  // Frontend
  React: ['react.js', 'reactjs'],
  'React Native': [],
  'Next.js': ['nextjs'],
  Vue: ['vue.js', 'vuejs'],
  Angular: [],
  Svelte: [],
  Redux: [],
  HTML: ['html5'],
  CSS: ['css3'],
  'Tailwind CSS': ['tailwind'],
  GraphQL: [],
  Flutter: [],
  Expo: [],
  SwiftUI: [],
  'Jetpack Compose': [],
  // Backend
  'Node.js': ['node', 'nodejs'],
  Express: ['express.js'],
  Fastify: [],
  NestJS: [],
  Django: [],
  Flask: [],
  FastAPI: [],
  'Spring Boot': ['spring'],
  'Ruby on Rails': ['rails'],
  Laravel: [],
  '.NET': ['dotnet', 'asp.net'],
  'REST APIs': ['rest', 'restful', 'rest api'],
  gRPC: [],
  Microservices: [],
  // Data
  PostgreSQL: ['postgres'],
  MySQL: [],
  MongoDB: ['mongo'],
  Redis: [],
  Elasticsearch: [],
  DynamoDB: [],
  Cassandra: [],
  Snowflake: [],
  BigQuery: [],
  Kafka: [],
  RabbitMQ: [],
  Spark: ['apache spark', 'pyspark'],
  Airflow: [],
  dbt: [],
  Pandas: [],
  NumPy: [],
  'Machine Learning': ['ml'],
  'Deep Learning': [],
  PyTorch: [],
  TensorFlow: [],
  'scikit-learn': ['sklearn'],
  LLMs: ['llm', 'large language models'],
  NLP: ['natural language processing'],
  'Data Analysis': ['data analytics'],
  Tableau: [],
  'Power BI': ['powerbi'],
  Excel: [],
  // Cloud / DevOps
  AWS: ['amazon web services'],
  GCP: ['google cloud', 'google cloud platform'],
  Azure: [],
  Docker: [],
  Kubernetes: ['k8s'],
  Terraform: [],
  Ansible: [],
  'CI/CD': ['ci cd', 'continuous integration'],
  'GitHub Actions': [],
  Jenkins: [],
  Linux: [],
  Git: [],
  Serverless: [],
  Supabase: [],
  Firebase: [],
  // Practice
  Agile: [],
  Scrum: [],
  'System Design': [],
  'Unit Testing': ['tdd'],
  Jest: [],
  Playwright: [],
  Cypress: [],
  Security: ['cybersecurity'],
  // Design / product
  Figma: [],
  'UI/UX': ['ux', 'ui design', 'user experience'],
  'Product Management': [],
  SEO: [],
  Salesforce: [],
  Jira: [],
};

interface Matcher {
  skill: string;
  re: RegExp;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Skill names that are also ordinary English words / letters: only match the exact casing.
const CASE_SENSITIVE = new Set(['C', 'R', 'Go', 'Swift', 'Rust', 'Spring Boot', 'Express', 'Spark', 'Security', 'Excel', 'Agile']);

const MATCHERS: Matcher[] = Object.entries(SKILLS).map(([skill, aliases]) => {
  const terms = [skill, ...aliases].map(escape).sort((a, b) => b.length - a.length);
  // Custom word boundary so "C++", "C#", ".NET", "Node.js" work.
  const flags = CASE_SENSITIVE.has(skill) ? 'g' : 'gi';
  return { skill, re: new RegExp(`(?<![\\w+#.])(?:${terms.join('|')})(?![\\w+#]|\\.\\w)`, flags) };
});

export const KNOWN_SKILLS = Object.keys(SKILLS);

/** Return canonical skills mentioned in text, most frequent first. */
export function extractSkills(text: string, limit = 25): string[] {
  if (!text) return [];
  const counts = new Map<string, number>();
  for (const { skill, re } of MATCHERS) {
    re.lastIndex = 0;
    let n = 0;
    for (const m of text.matchAll(re)) {
      // "Go to our site." / "Swift delivery": an English word starting a sentence is not a skill.
      if (CASE_SENSITIVE.has(skill) && /(^|[.!?:]\s+|\n\s*)$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
      n++;
    }
    if (n > 0) counts.set(skill, n);
  }
  // "C" and "R" alone are noisy: require them to appear in a list-like context.
  for (const single of ['C', 'R']) {
    if (counts.has(single) && !new RegExp(`(?:^|[,(/:]\\s*)${single}(?:\\s*[,)/]|$)`, 'm').test(text)) {
      counts.delete(single);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([s]) => s);
}

/** Map a free-form skill string to its canonical name if known, else return trimmed input. */
export function canonicalSkill(raw: string): string {
  const t = raw.trim();
  for (const { skill, re } of MATCHERS) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (m && m[0].length === t.length) return skill;
  }
  return t;
}

export interface SkillMention {
  skill: string;
  /** The exact text that matched, e.g. "Postgres" for PostgreSQL */
  text: string;
  index: number;
}

/** Every skill mention in text with its position (used to align wording with a job's terms). */
export function findSkillMentions(text: string): SkillMention[] {
  const out: SkillMention[] = [];
  for (const { skill, re } of MATCHERS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (CASE_SENSITIVE.has(skill) && /(^|[.!?:]\s+|\n\s*)$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
      out.push({ skill, text: m[0], index: m.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
