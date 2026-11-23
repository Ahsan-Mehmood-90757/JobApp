-- 001_init: core schema for the job aggregator and resume editor.
-- Plain Postgres 15+; also runs unchanged on Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE work_arrangement AS ENUM ('remote', 'onsite', 'hybrid');
CREATE TYPE market_scope AS ENUM ('global', 'country', 'city');
CREATE TYPE seniority_tier AS ENUM ('entry', 'mid', 'senior', 'lead');
CREATE TYPE extraction_source AS ENUM ('source', 'heuristic', 'inferred', 'llm');
CREATE TYPE saved_job_status AS ENUM ('saved', 'applied', 'interviewing', 'offer', 'rejected');

-- array_to_string is only STABLE; generated columns need an IMMUTABLE expression.
CREATE FUNCTION immutable_array_join(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, ' ') $$;

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 text UNIQUE,
  full_name             text NOT NULL DEFAULT '',
  years_experience      integer NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 50),
  target_titles         text[] NOT NULL DEFAULT '{}',
  preferred_locations   text[] NOT NULL DEFAULT '{}',
  -- Job market: global, one country, or one city
  market_scope          market_scope NOT NULL DEFAULT 'global',
  market_country_code   char(2),
  market_city           text,
  -- Which of remote / onsite / hybrid the user wants
  work_arrangements     work_arrangement[] NOT NULL DEFAULT '{remote,onsite,hybrid}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_market_country_required
    CHECK (market_scope = 'global' OR market_country_code IS NOT NULL),
  CONSTRAINT users_market_city_required
    CHECK (market_scope <> 'city' OR market_city IS NOT NULL)
);

-- ---------------------------------------------------------------- jobs
CREATE TABLE jobs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_hash            char(64) NOT NULL UNIQUE,
  source_platform       text NOT NULL,          -- e.g. linkedin, indeed, greenhouse
  source_key            text NOT NULL,          -- adapter + feed, e.g. jsearch, greenhouse:stripe
  external_job_id       text,
  title                 text NOT NULL,
  normalized_title      text NOT NULL,
  company_name          text NOT NULL,
  location              text NOT NULL DEFAULT '',
  city                  text,
  region                text,
  country_code          char(2),
  work_arrangement      work_arrangement NOT NULL DEFAULT 'onsite',
  is_remote             boolean GENERATED ALWAYS AS (work_arrangement = 'remote') STORED,
  min_years_experience  integer CHECK (min_years_experience BETWEEN 0 AND 50),
  max_years_experience  integer CHECK (max_years_experience BETWEEN 0 AND 50),
  experience_source     extraction_source,
  seniority_tier        seniority_tier,
  core_skills           text[] NOT NULL DEFAULT '{}',
  description_raw       text NOT NULL DEFAULT '',
  apply_url             text NOT NULL,
  posted_at             timestamptz,
  first_seen_at         timestamptz NOT NULL DEFAULT now(),
  last_verified_at      timestamptz NOT NULL DEFAULT now(),
  last_link_check_at    timestamptz,
  is_active             boolean NOT NULL DEFAULT true,
  inactive_reason       text,
  search_vector         tsvector GENERATED ALWAYS AS (
                          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                          setweight(to_tsvector('english', coalesce(company_name, '')), 'B') ||
                          setweight(to_tsvector('english', immutable_array_join(core_skills)), 'B') ||
                          setweight(to_tsvector('english', left(coalesce(description_raw, ''), 20000)), 'D')
                        ) STORED
);

CREATE INDEX jobs_min_years_idx      ON jobs (min_years_experience);
CREATE INDEX jobs_posted_at_idx      ON jobs (posted_at DESC NULLS LAST);
CREATE INDEX jobs_core_skills_gin    ON jobs USING gin (core_skills);
CREATE INDEX jobs_search_vector_gin  ON jobs USING gin (search_vector);
CREATE INDEX jobs_market_idx         ON jobs (country_code, lower(city));
CREATE INDEX jobs_work_arr_idx       ON jobs (work_arrangement);
CREATE INDEX jobs_active_posted_idx  ON jobs (posted_at DESC) WHERE is_active;
CREATE INDEX jobs_source_key_idx     ON jobs (source_key, last_verified_at);

-- ---------------------------------------------------------------- resumes
CREATE TABLE user_resumes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_file_url  text,
  parsed_json        jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_resumes_user_idx ON user_resumes (user_id, updated_at DESC);

CREATE TABLE tailored_resumes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_resume_id    uuid NOT NULL REFERENCES user_resumes(id) ON DELETE CASCADE,
  job_id            uuid REFERENCES jobs(id) ON DELETE SET NULL,
  tailored_json     jsonb NOT NULL,
  exported_pdf_url  text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tailored_resumes_user_idx ON tailored_resumes (user_id, created_at DESC);

CREATE TABLE saved_jobs (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status      saved_job_status NOT NULL DEFAULT 'saved',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, job_id)
);

-- ---------------------------------------------------------------- ops
CREATE TABLE ingestion_runs (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,          -- ingest | sweep
  source_key   text,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  fetched      integer NOT NULL DEFAULT 0,
  inserted     integer NOT NULL DEFAULT 0,
  updated      integer NOT NULL DEFAULT 0,
  deactivated  integer NOT NULL DEFAULT 0,
  error        text
);
