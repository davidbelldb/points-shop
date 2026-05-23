-- Ducky Derby: a random duck race the user bets points on.

-- Singleton config (admin tunes this in a later phase).
CREATE TABLE IF NOT EXISTS ducky_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  race_duck_count INTEGER NOT NULL DEFAULT 4 CHECK (race_duck_count BETWEEN 2 AND 4),
  water_colour TEXT NOT NULL DEFAULT '#4aa3c7',
  homepage_visible BOOLEAN NOT NULL DEFAULT FALSE,
  homepage_title TEXT NOT NULL DEFAULT 'Ducky Derby',
  homepage_subtitle TEXT,
  homepage_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Up to 10 ducks. Admin sets name/colours/odds/active later.
CREATE TABLE IF NOT EXISTS ducky_ducks (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 10),
  name TEXT NOT NULL DEFAULT 'Duck',
  duck_colour TEXT NOT NULL DEFAULT '#ffd23f',
  bill_colour TEXT NOT NULL DEFAULT '#ff8c00',
  odds NUMERIC(5,2) NOT NULL DEFAULT 3.0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_ducks (ord, name, odds) VALUES
  (1, 'Sir Quacks-a-Lot', 2.0),
  (2, 'Bill Murray',      2.5),
  (3, 'Duckie Brown',     3.0),
  (4, 'Feather Locklear', 3.5),
  (5, 'Quackie Chan',     4.0),
  (6, 'Mc Fluff',         5.0),
  (7, 'Webby',            6.0),
  (8, 'The Mallardinator', 8.0),
  (9, 'Pondscum Pete',    10.0),
  (10,'Long-shot Larry',  15.0)
ON CONFLICT (ord) DO NOTHING;

-- One row per race. Created at lineup time (winner + timings decided + hidden);
-- the bet fields are filled in when the race is actually run.
CREATE TABLE IF NOT EXISTS ducky_races (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  lineup JSONB NOT NULL,            -- [{ord,name,duck_colour,bill_colour,odds}]
  winner_ord INTEGER NOT NULL,
  finish_ms JSONB NOT NULL,         -- {ord: ms}
  curves JSONB NOT NULL,            -- {ord: curveName}
  stake INTEGER,
  picked_ord INTEGER,
  payout INTEGER,
  won BOOLEAN,
  raced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ducky_races_account ON ducky_races(account_id, created_at DESC);
