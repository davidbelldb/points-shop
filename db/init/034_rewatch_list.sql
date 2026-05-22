-- Rewatch list: films / TV shows a user wants to (re)watch, with a target month,
-- priority, an "invite David?" flag, and TMDB metadata (poster, genres, score).

CREATE TABLE IF NOT EXISTS rewatch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tmdb_id INTEGER,
  media_type TEXT,                    -- 'movie' | 'tv' | NULL (free-text entry)
  title TEXT NOT NULL,
  poster_url TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  tmdb_score NUMERIC(3,1),            -- TMDB community score 0.0 - 10.0
  watch_month INTEGER CHECK (watch_month BETWEEN 1 AND 12),
  watch_year INTEGER,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  invite_david BOOLEAN NOT NULL DEFAULT FALSE,
  watched BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewatch_account ON rewatch_items(account_id, created_at DESC);
