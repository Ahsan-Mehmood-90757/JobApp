/** ISO 3166-1 alpha-2 → display name. Covers the markets job boards realistically list. */
export const COUNTRIES: Record<string, string> = {
  AE: 'United Arab Emirates', AR: 'Argentina', AT: 'Austria', AU: 'Australia', BD: 'Bangladesh',
  BE: 'Belgium', BG: 'Bulgaria', BH: 'Bahrain', BR: 'Brazil', CA: 'Canada', CH: 'Switzerland',
  CL: 'Chile', CN: 'China', CO: 'Colombia', CR: 'Costa Rica', CY: 'Cyprus', CZ: 'Czechia',
  DE: 'Germany', DK: 'Denmark', EE: 'Estonia', EG: 'Egypt', ES: 'Spain', FI: 'Finland',
  FR: 'France', GB: 'United Kingdom', GH: 'Ghana', GR: 'Greece', HK: 'Hong Kong', HR: 'Croatia',
  HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India', IT: 'Italy',
  JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KR: 'South Korea', KW: 'Kuwait', LK: 'Sri Lanka',
  LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MA: 'Morocco', MT: 'Malta', MX: 'Mexico',
  MY: 'Malaysia', NG: 'Nigeria', NL: 'Netherlands', NO: 'Norway', NZ: 'New Zealand', OM: 'Oman',
  PE: 'Peru', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland', PT: 'Portugal', QA: 'Qatar',
  RO: 'Romania', RS: 'Serbia', SA: 'Saudi Arabia', SE: 'Sweden', SG: 'Singapore', SI: 'Slovenia',
  SK: 'Slovakia', TH: 'Thailand', TR: 'Turkey', TW: 'Taiwan', UA: 'Ukraine', US: 'United States',
  UY: 'Uruguay', VN: 'Vietnam', ZA: 'South Africa',
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', us: 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', 'u.k.': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB', britain: 'GB',
  uae: 'AE', emirates: 'AE', ksa: 'SA', 'czech republic': 'CZ', korea: 'KR', 'republic of korea': 'KR',
  holland: 'NL', 'the netherlands': 'NL', deutschland: 'DE', türkiye: 'TR', turkiye: 'TR',
};

/** Well-known cities, so "Remote - London" or "Dubai" resolve to a country without one being named. */
const CITY_COUNTRY: Record<string, string> = {
  'new york': 'US', nyc: 'US', 'san francisco': 'US', 'los angeles': 'US', seattle: 'US', austin: 'US',
  boston: 'US', chicago: 'US', denver: 'US', atlanta: 'US', miami: 'US', 'washington': 'US',
  london: 'GB', manchester: 'GB', edinburgh: 'GB', dublin: 'IE', berlin: 'DE', munich: 'DE',
  hamburg: 'DE', paris: 'FR', amsterdam: 'NL', madrid: 'ES', barcelona: 'ES', lisbon: 'PT',
  stockholm: 'SE', copenhagen: 'DK', oslo: 'NO', helsinki: 'FI', zurich: 'CH', vienna: 'AT',
  warsaw: 'PL', prague: 'CZ', toronto: 'CA', vancouver: 'CA', montreal: 'CA', sydney: 'AU',
  melbourne: 'AU', singapore: 'SG', tokyo: 'JP', bangalore: 'IN', bengaluru: 'IN', mumbai: 'IN',
  hyderabad: 'IN', pune: 'IN', delhi: 'IN', 'new delhi': 'IN', gurgaon: 'IN', gurugram: 'IN',
  dubai: 'AE', 'abu dhabi': 'AE', riyadh: 'SA', jeddah: 'SA', doha: 'QA', karachi: 'PK',
  lahore: 'PK', islamabad: 'PK', cairo: 'EG', lagos: 'NG', nairobi: 'KE', 'cape town': 'ZA',
  johannesburg: 'ZA', brussels: 'BE', bucharest: 'RO', kraków: 'PL', krakow: 'PL', budapest: 'HU',
  athens: 'GR', istanbul: 'TR', rome: 'IT', milan: 'IT', frankfurt: 'DE', geneva: 'CH', 'sydney nsw': 'AU', 'tel aviv': 'IL', 'são paulo': 'BR', 'sao paulo': 'BR', 'mexico city': 'MX',
  'buenos aires': 'AR', bogota: 'CO', 'bogotá': 'CO', manila: 'PH', jakarta: 'ID',
  'kuala lumpur': 'MY', bangkok: 'TH', 'ho chi minh city': 'VN', seoul: 'KR', 'hong kong': 'HK',
};

/** Short forms boards use for big cities. */
const CITY_ALIASES: Record<string, { city: string; countryCode: string }> = {
  nyc: { city: 'New York', countryCode: 'US' }, ny: { city: 'New York', countryCode: 'US' },
  sf: { city: 'San Francisco', countryCode: 'US' }, sfo: { city: 'San Francisco', countryCode: 'US' },
  sea: { city: 'Seattle', countryCode: 'US' }, chi: { city: 'Chicago', countryCode: 'US' },
  la: { city: 'Los Angeles', countryCode: 'US' }, dc: { city: 'Washington', countryCode: 'US' },
  ldn: { city: 'London', countryCode: 'GB' }, blr: { city: 'Bengaluru', countryCode: 'IN' },
};

const CITY_STATES = new Set(['SG', 'HK', 'LU', 'MT']);

/** One spelling per city so "New York City", "NYC" and "New York" filter and group together. */
export function canonicalCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const t = city.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const key = t.toLowerCase().replace(/\s+city$/, '');
  const alias = CITY_ALIASES[t.toLowerCase()] ?? CITY_ALIASES[key];
  if (alias) return alias.city;
  if (key === 'new york') return 'New York';
  if (key === 'bangalore') return 'Bengaluru';
  if (key === 'gurgaon') return 'Gurugram';
  return t;
}

const JUNK_LOCATION = /^\s*(n\/?a|none|tbd|tba|location|locations|various|multiple locations?|flexible|unknown|-+)\s*$/i;

const US_STATES = new Set(
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '),
);
const CA_PROVINCES = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));

const NAME_TO_CODE: Record<string, string> = Object.fromEntries([
  ...Object.entries(COUNTRIES).map(([code, name]) => [name.toLowerCase(), code]),
  ...Object.entries(COUNTRY_ALIASES),
]);

export function countryName(code: string | null | undefined): string {
  return (code && COUNTRIES[code.toUpperCase()]) || code || '';
}

/** Resolve a country name, alias or ISO2 code to an ISO2 code. */
export function toCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^[A-Za-z]{2}$/.test(t) && COUNTRIES[t.toUpperCase()]) return t.toUpperCase();
  return NAME_TO_CODE[t.toLowerCase()] ?? null;
}

export interface ParsedLocation {
  city: string | null;
  region: string | null;
  countryCode: string | null;
  /** The string looked like "Remote" / "Anywhere" / "Worldwide" */
  mentionsRemote: boolean;
  mentionsHybrid: boolean;
}

const REMOTE_WORDS = /\b(remote|anywhere|worldwide|work from home|wfh|distributed|global)\b/i;
const HYBRID_WORDS = /\bhybrid\b/i;
const NOISE = /\b(remote|anywhere|worldwide|work from home|wfh|distributed|hybrid|on-?site|in-?office|office|global|only|based|first|friendly)\b/gi;

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
}

/**
 * Best-effort parse of free-form location strings from job boards:
 * "San Francisco, CA", "London, England, United Kingdom", "Remote - US", "Hybrid (Berlin)",
 * "Dubai", "Remote, EMEA".
 */
export function parseLocation(raw: string | null | undefined): ParsedLocation {
  const result: ParsedLocation = { city: null, region: null, countryCode: null, mentionsRemote: false, mentionsHybrid: false };
  if (!raw) return result;
  result.mentionsRemote = REMOTE_WORDS.test(raw);
  result.mentionsHybrid = HYBRID_WORDS.test(raw);

  if (JUNK_LOCATION.test(raw)) return result;

  // Multiple locations ("NYC; London", "SF, SEA, NYC") → only parse the first one.
  let first = raw.split(/\s*(?:;|\||\bor\b|\/)\s*/i)[0] ?? raw;
  // "US-NYC" style
  const prefixed = /^([A-Z]{2})-([^,]{2,})/.exec(first.trim());
  if (prefixed && COUNTRIES[prefixed[1]!]) first = `${prefixed[2]}, ${prefixed[1]}`;
  const cleaned = first.replace(/[()[\]]/g, ',').replace(NOISE, ',').replace(/\s+-\s+/g, ',');
  let parts = cleaned
    .split(',')
    .map((p) => p.trim().replace(/^[-–:]+|[-–:]+$/g, '').replace(/^(in|from)\s+(the\s+)?/i, '').trim())
    .filter((p) => p.length > 0 && !JUNK_LOCATION.test(p));
  if (parts.length === 0) return result;

  // A list of city codes: keep the first, resolve the alias.
  const alias = CITY_ALIASES[parts[0]!.toLowerCase()];
  if (alias) {
    result.city = alias.city;
    result.countryCode = alias.countryCode;
    parts = parts.slice(1).filter((p) => !CITY_ALIASES[p.toLowerCase()]);
    const cc = parts.map((p) => toCountryCode(p)).find(Boolean);
    if (cc && cc !== alias.countryCode && !US_STATES.has(parts[0] ?? '')) result.countryCode = cc;
    return result;
  }

  // Country: look from the right.
  let countryIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]!;
    // "San Francisco, CA" is California, not Canada; "Berlin, DE" is Germany, not Delaware.
    if (i > 0 && /^[A-Z]{2}$/.test(part) && (US_STATES.has(part) || CA_PROVINCES.has(part))) {
      const knownCity = CITY_COUNTRY[parts[0]!.toLowerCase()];
      if (knownCity !== part) continue;
    }
    const code = toCountryCode(part);
    if (code) {
      result.countryCode = code;
      countryIdx = i;
      break;
    }
  }
  const rest = countryIdx >= 0 ? parts.slice(0, countryIdx) : parts;

  // US state / Canadian province abbreviations
  const last = rest[rest.length - 1];
  if (last && /^[A-Z]{2}$/.test(last)) {
    if (US_STATES.has(last) && (!result.countryCode || result.countryCode === 'US')) {
      result.countryCode = 'US';
      result.region = last;
      rest.pop();
    } else if (CA_PROVINCES.has(last) && (!result.countryCode || result.countryCode === 'CA')) {
      result.countryCode = 'CA';
      result.region = last;
      rest.pop();
    }
  }

  // Region names like "EMEA", "Europe" are not cities.
  const regionWords = /^(emea|apac|latam|amer|amers|noram|na|europe|eu|americas|north america|asia|africa|middle east|mena|gcc|us time ?zones?|timezone.*)$/i;
  if (rest.length === 0 && result.countryCode && CITY_STATES.has(result.countryCode)) {
    result.city = COUNTRIES[result.countryCode] ?? null;
    return result;
  }
  const cityCandidate = rest.find((p) => !regionWords.test(p) && !/\d/.test(p) && p.length <= 40);
  if (cityCandidate) {
    result.city = canonicalCity(titleCase(cityCandidate));
    if (!result.region && rest.length >= 2) result.region = rest[1] ?? null;
    if (!result.countryCode) result.countryCode = CITY_COUNTRY[cityCandidate.toLowerCase()] ?? null;
  }
  return result;
}
