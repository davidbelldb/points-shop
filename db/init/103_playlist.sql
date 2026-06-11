-- Games play list — exact structural replica of the rewatch (watch list)
-- feature, with IGDB as the metadata source instead of TMDB.
CREATE TABLE IF NOT EXISTS playlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  igdb_id INTEGER,
  title TEXT NOT NULL,
  cover_url TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  platforms TEXT[] NOT NULL DEFAULT '{}',
  igdb_score NUMERIC(3,1),                  -- IGDB total rating scaled to 0.0-10.0
  play_month INTEGER CHECK (play_month BETWEEN 1 AND 12),
  play_year INTEGER,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  invite_partner BOOLEAN NOT NULL DEFAULT FALSE,
  played_before BOOLEAN NOT NULL DEFAULT TRUE,  -- true = "To replay" section
  played BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playlist_account ON playlist_items(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS playlist_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  igdb_id INTEGER,
  title TEXT NOT NULL,
  cover_url TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  platforms TEXT[] NOT NULL DEFAULT '{}',
  igdb_score NUMERIC(3,1),
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playlist_invites_to ON playlist_invites(to_account_id, status);
