-- Watch-list invites: when someone ticks "invite {partner}", a pending invite is created
-- for the other account. They accept (item copied to their list) or decline.
-- The title metadata is snapshotted so the invite stands alone.

CREATE TABLE IF NOT EXISTS rewatch_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tmdb_id INTEGER,
  media_type TEXT,
  title TEXT NOT NULL,
  poster_url TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  tmdb_score NUMERIC(3,1),
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewatch_invites_to ON rewatch_invites(to_account_id, status);
