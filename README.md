# JobApp: Job Aggregator & Resume Editor

**How it all works, in depth:** [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)

Monorepo for the iOS/Android job aggregator and on-the-spot resume editor.

```
apps/api          Node + Fastify API, ingestion worker, dead-link sweeper (TypeScript)
apps/mobile       Expo app for iOS and Android (Expo Router, TanStack Query)
packages/shared   Types and logic shared by API and app: enums, resume JSON schema,
                  search query schema, skills dictionary, location parser
```

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Monorepo, Postgres schema, shared types | ✅ done |
| 2 | Ingestion adapters, dedup, experience extraction, sweeper, jobs API | ✅ done |
| 3 | Resume upload/parse, match audit, bullet tailoring, PDF export | ✅ done |
| 4 | Expo screens (iOS + Android) | ✅ done |

## Decisions so far

- **Database:** local Postgres now. The plain SQL migrations also run on Supabase.
- **Queue:** no Redis. The worker uses `node-cron` with Postgres advisory locks, so running more than one worker is safe.
- **Job sources:** `JSearchAdapter` (LinkedIn, Indeed, Glassdoor; needs a RapidAPI key) and `AtsDirectAdapter` (Greenhouse, Lever and Ashby public boards; no key). No direct scraping.
- **Identity (MVP):** `POST /api/users` creates an anonymous user. The app sends its id as the `X-User-Id` header. Swap this for Supabase Auth before launch.
- **Files:** stored on local disk under `apps/api/storage/` and served through HMAC-signed links that expire. The interface matches Supabase Storage, so it can be swapped later.
- **AI is optional.** Experience, seniority, skills and work arrangement are extracted deterministically: source fields first, then regex and a skills dictionary, then the title. `jobs.experience_source` records which one was used (`source` / `heuristic` / `inferred`). An LLM can be added later for resume parsing and bullet rewriting.
- **Work arrangement:** every job is exactly one of `remote` / `onsite` / `hybrid`.
- **Job market:** `global` / `country` / `city`.
  - `global`: no location filter.
  - `country=XX`: jobs in that country, plus remote jobs that name no country (open to anyone).
  - `city`: onsite and hybrid jobs in that city, plus remote jobs open to that city's country.

## Local setup (macOS)

```bash
brew services start postgresql@17
createdb jobapp
npm install
cp apps/api/.env.example apps/api/.env   # add JSEARCH_API_KEY if you have one
npm run db:migrate
npm run ingest                           # pull jobs now
npm run api:dev                          # http://localhost:4000
npm run api:worker                       # scheduled ingest every 4h + daily sweep
```

Then the app, in a second terminal:

```bash
cd apps/mobile && npx expo start   # press i for the iOS Simulator, or scan the QR code with Expo Go
```

Tests and types: `npm test`, `npm run typecheck`.

### Always-on test server (macOS)

```bash
scripts/mac/install-autostart.sh   # API + job worker + ngrok tunnel start at login, restart on crash
scripts/mac/status.sh              # what's running, and the public tunnel address
scripts/mac/uninstall-autostart.sh # remove it again
```

The project must sit outside Desktop/Documents/Downloads (macOS blocks background services there).
ngrok needs a free account (`ngrok config add-authtoken …`) and a claimed free domain.
Details in [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md#11-running-it-auto-start-and-the-apk).

## API

`GET /api/jobs`

| param | example | notes |
|---|---|---|
| `q` | `react native` | full-text search over title, company, skills and description |
| `max_experience` | `3` | keeps jobs whose `min_years_experience <= 3`, plus jobs that state no requirement |
| `work_type` | `remote,hybrid` | any of remote, onsite, hybrid |
| `market` | `global` \| `country` \| `city` | |
| `country` | `US` | ISO-2; required for `country` and `city` |
| `city` | `New York` | required for `city` |
| `seniority` | `entry,mid` | |
| `posted_within_days` | `7` | |
| `page`, `page_size` | `1`, `20` | |

- `GET /api/jobs/:id`: the job plus its full description.
- `GET /api/markets`: countries and cities that have active jobs, with counts, for the market picker.
- `GET /health`

### Resumes

All of these need the `X-User-Id` header.

- `POST /api/users`: create a user. Then `GET` / `PUT /api/users/me` for the profile: years, target titles, `workArrangements`, `marketScope`, `marketCountryCode`, `marketCity`.
- `POST /api/resumes/upload`: multipart `file` (PDF or DOCX). It is parsed into the canonical JSON. The response includes `warnings` for anything the parser couldn't find.
- `GET /api/resumes`, `GET` / `PUT /api/resumes/:id` (`{ resume }`), `POST /api/resumes` (`{ resume }`).
- `POST /api/jobs/:jobId/match-audit` with `{ resumeId? , resume? }`. Returns:
  - the score, matched and missing skills, and skills listed but not backed up by any bullet;
  - the experience gap;
  - which bullets to improve, and why.
- `POST /api/resumes/:id/tailor-bullet` with `{ jobId, text }`. Returns a before/after suggestion for the user to approve.
  - The rules engine only rewords: it uses action verbs and the job's names for tools you already mention.
  - It never adds skills, numbers, employers or dates. Missing job skills are returned in `considerIfTrue` for the user to decide.
- `POST /api/resumes/:id/export-pdf` with `{ resume?, jobId?, paper? }`. Returns a signed PDF URL, a file name like `Sarah_Malik_Stripe_Resume.pdf`, and the job's `applyUrl`. Paper defaults to Letter in the US/CA and A4 elsewhere.

How the resume pieces work:
- **PDF parsing** rebuilds lines from text positions, so right-aligned dates stay with their role. pdf.js on its own returns them out of order.
- **The PDF template** is a single-column, ATS-safe layout rendered by headless Chromium. An exported PDF re-parses to identical JSON. [Sample](docs/sample-resume-export.pdf).

## Freshness rules

- **Dedup:** `sha256(company | normalized_title | location)`. Re-seeing a job only bumps `last_verified_at`.
- **Company boards are complete snapshots.** A job that disappears from its board is marked inactive (`removed_from_board`). A board takes ownership of a job first seen via JSearch.
- **Daily sweep:**
  - JSearch jobs older than `JOB_MAX_AGE_DAYS` expire.
  - JSearch jobs not re-seen in 24h get a link check. A link is dead on HTTP 404/410, closed-job text on the page, or a redirect that drops the posting ID.
