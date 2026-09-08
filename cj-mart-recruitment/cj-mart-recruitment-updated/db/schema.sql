-- CJ Mart Recruitment Database Schema
-- Plain SQL, no Postgres extensions required (UUIDs are generated in application code)
-- so this runs unmodified on any managed Postgres provider (Render, Railway, Supabase, RDS, etc).

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  type          TEXT DEFAULT 'ไม่ระบุ',
  shift         TEXT DEFAULT 'ไม่ระบุ',
  salary_range  TEXT DEFAULT 'แจ้งในวันสัมภาษณ์',
  summary       TEXT DEFAULT '',
  requirements  TEXT DEFAULT '',
  is_open       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id                    TEXT PRIMARY KEY,
  job_id                TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  job_title             TEXT NOT NULL,
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  email                 TEXT DEFAULT '',
  area                  TEXT DEFAULT '',
  start_date            DATE,
  availability          TEXT[] NOT NULL DEFAULT '{}',
  experience            TEXT DEFAULT '',
  resume_path           TEXT,
  resume_original_name  TEXT,
  resume_mime_type      TEXT,
  photo_path            TEXT,
  photo_original_name   TEXT,
  photo_mime_type       TEXT,
  status                TEXT NOT NULL DEFAULT 'ใหม่',
  pdpa_consent          BOOLEAN NOT NULL DEFAULT false,
  pdpa_consent_at       TIMESTAMPTZ,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_submitted_at ON applications(submitted_at);

CREATE TABLE IF NOT EXISTS faq_rules (
  id          TEXT PRIMARY KEY,
  keywords    TEXT[] NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- key/value store for small pieces of site config that admins edit
-- (PDPA policy text + consent label, company overview text, and social
-- media links today; room to add more later without a migration).
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HR staff to show on the "ติดต่อเจ้าหน้าที่" page — different HR staff
-- often cover different positions/departments, so each row can note which
-- ones this person handles.
CREATE TABLE IF NOT EXISTS hr_contacts (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  coverage       TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  email          TEXT DEFAULT '',
  line_id        TEXT DEFAULT '',
  display_order  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
