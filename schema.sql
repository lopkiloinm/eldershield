-- ElderShield Database Schema
-- Ghost-managed Postgres (set DATABASE_URL to your Ghost DB connection string)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Households: one per family / caregiver group
CREATE TABLE IF NOT EXISTS households (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages: raw incoming texts (manual or inbox sweep)
CREATE TABLE IF NOT EXISTS messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source       TEXT        NOT NULL CHECK (source IN ('manual', 'inbox')),
  raw_text     TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- URL Inspections: one per URL analysed by TinyFish
CREATE TABLE IF NOT EXISTS url_inspections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID        REFERENCES messages(id) ON DELETE SET NULL,
  url              TEXT        NOT NULL,
  domain           TEXT,
  tinyfish_run_id  TEXT,
  raw_page_summary JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk Events: classification result, keyed by jobId for easy lookup
CREATE TABLE IF NOT EXISTS risk_events (
  id                  UUID        PRIMARY KEY,   -- set equal to jobId
  household_id        UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  url_inspection_id   UUID        REFERENCES url_inspections(id) ON DELETE SET NULL,
  risk                TEXT        NOT NULL CHECK (risk IN ('SAFE', 'SUSPICIOUS', 'SCAM')),
  explanation         TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_messages_household    ON messages(household_id);
CREATE INDEX IF NOT EXISTS idx_url_inspections_url   ON url_inspections(url);
CREATE INDEX IF NOT EXISTS idx_risk_events_household ON risk_events(household_id);
CREATE INDEX IF NOT EXISTS idx_risk_events_created   ON risk_events(created_at DESC);
