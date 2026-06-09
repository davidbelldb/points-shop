-- Sneaky Notes: per-account private notes, sorted by most recently updated.
-- The body stores the full text; the first line is treated as the title by
-- the frontend (Apple Notes style) — no separate title column needed.

CREATE TABLE IF NOT EXISTS notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_account_updated
  ON notes(account_id, updated_at DESC);
