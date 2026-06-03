-- Shut the Box 15 — separate tables so it can be configured independently.

CREATE TABLE IF NOT EXISTS stb15_games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  result          TEXT,
  final_tiles_open INTEGER[]
);
CREATE INDEX IF NOT EXISTS idx_stb15_account_started ON stb15_games (account_id, started_at);

CREATE TABLE IF NOT EXISTS stb15_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  homepage_visible BOOLEAN NOT NULL DEFAULT FALSE,
  homepage_title TEXT NOT NULL DEFAULT 'Shut the Box 15',
  homepage_subtitle TEXT,
  homepage_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  felt_colour TEXT NOT NULL DEFAULT '#15b8a6',
  frame_colour TEXT NOT NULL DEFAULT '#0b8476',
  tile_colour TEXT NOT NULL DEFAULT '#0b8476',
  ink_colour TEXT NOT NULL DEFAULT '#faf5e6',
  hidden_message TEXT NOT NULL DEFAULT 'I_MISS_YOU_SO_MUCH!!',
  dice_colour TEXT NOT NULL DEFAULT '#e773b0',
  pip_colour TEXT NOT NULL DEFAULT '#000000',
  table_colour TEXT NOT NULL DEFAULT '#d3f3ea',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO stb15_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS stb15_scattered_sets (
  ord    INTEGER PRIMARY KEY,
  back   TEXT NOT NULL DEFAULT '________',
  front  TEXT NOT NULL DEFAULT '_______',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO stb15_scattered_sets (ord, back, front, active) VALUES
  (1, '________', '_______', true),
  (2, '________', '_______', false),
  (3, '________', '_______', false),
  (4, '________', '_______', false),
  (5, '________', '_______', false)
ON CONFLICT (ord) DO NOTHING;

CREATE TABLE IF NOT EXISTS stb15_table_colours (
  ord    INTEGER PRIMARY KEY,
  colour TEXT NOT NULL DEFAULT '#d3f3ea',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO stb15_table_colours (ord, colour, active) VALUES
  (1, '#d3f3ea', true),
  (2, '#f3e8d3', false),
  (3, '#e8d3f3', false)
ON CONFLICT (ord) DO NOTHING;

CREATE TABLE IF NOT EXISTS stb15_dice_palettes (
  ord    INTEGER PRIMARY KEY,
  body   TEXT NOT NULL DEFAULT '#e773b0',
  pip    TEXT NOT NULL DEFAULT '#000000',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO stb15_dice_palettes (ord, body, pip, active) VALUES
  (1, '#e773b0', '#000000', true),
  (2, '#73b0e7', '#ffffff', false),
  (3, '#b0e773', '#000000', false),
  (4, '#e7b073', '#000000', false)
ON CONFLICT (ord) DO NOTHING;

CREATE TABLE IF NOT EXISTS stb15_tile_messages (
  ord    INTEGER PRIMARY KEY,
  message TEXT NOT NULL DEFAULT '_______________',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO stb15_tile_messages (ord, message, active) VALUES
  (1, 'I_MISS_YOU_SO!!', true),
  (2, '_______________', false),
  (3, '_______________', false),
  (4, '_______________', false),
  (5, '_______________', false),
  (6, '_______________', false),
  (7, '_______________', false),
  (8, '_______________', false),
  (9, '_______________', false),
  (10, '_______________', false)
ON CONFLICT (ord) DO NOTHING;
