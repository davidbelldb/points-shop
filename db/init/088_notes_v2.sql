-- Sneaky Notes v2: shared/personal types, soft-delete with 30-day auto-purge, archive.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS type       TEXT NOT NULL DEFAULT 'personal'
    CHECK (type IN ('personal', 'shared')),
  ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Replace original single index with status-aware composites
DROP INDEX IF EXISTS notes_account_updated;

CREATE INDEX IF NOT EXISTS notes_account_status
  ON notes (account_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS notes_shared_status
  ON notes (type, status, updated_at DESC)
  WHERE type = 'shared';
