-- Ducky Derby phase 2: up to 10 ducks racing, river-bank banners, duck speech phrases.

-- Allow up to 10 ducks in a race (was capped at 4).
ALTER TABLE ducky_config DROP CONSTRAINT IF EXISTS ducky_config_race_duck_count_check;
ALTER TABLE ducky_config ALTER COLUMN race_duck_count SET DEFAULT 10;
ALTER TABLE ducky_config ADD CONSTRAINT ducky_config_race_duck_count_check
  CHECK (race_duck_count BETWEEN 2 AND 10);
UPDATE ducky_config SET race_duck_count = 10 WHERE id = 1;

-- Per-duck whirlpool data on each race; curves no longer used.
ALTER TABLE ducky_races ADD COLUMN IF NOT EXISTS whirlpools JSONB NOT NULL DEFAULT '{}';
ALTER TABLE ducky_races ALTER COLUMN curves DROP NOT NULL;

-- Banner messages for the top grass bank.
CREATE TABLE IF NOT EXISTS ducky_banners (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 6),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_banners (ord, text, active) VALUES
  (1, 'Welcome to the Derby!', TRUE),
  (2, '', FALSE), (3, '', FALSE), (4, '', FALSE), (5, '', FALSE), (6, '', FALSE)
ON CONFLICT (ord) DO NOTHING;

-- Speech-bubble phrases.
CREATE TABLE IF NOT EXISTS ducky_phrases (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 12),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_phrases (ord, text, active) VALUES
  (1, 'I got this!', TRUE),
  (2, 'Quack quack!', TRUE),
  (3, 'Eat my wake!', TRUE),
  (4, 'I definitely don''t got this', TRUE),
  (5, '', FALSE), (6, '', FALSE), (7, '', FALSE), (8, '', FALSE),
  (9, '', FALSE), (10, '', FALSE), (11, '', FALSE), (12, '', FALSE)
ON CONFLICT (ord) DO NOTHING;
