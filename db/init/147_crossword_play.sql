-- Play state for the crossword. `version` bumps whenever the puzzle is
-- re-saved, so each distinct puzzle can award its solve points once. Progress
-- is per-account: the letters placed so far, and whether it's been submitted
-- (locked) and won.
ALTER TABLE crossword
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS crossword_progress (
  account_id   UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  entries      JSONB NOT NULL DEFAULT '{}',   -- { "r,c": "A" }
  submitted    BOOLEAN NOT NULL DEFAULT FALSE,
  won          BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
