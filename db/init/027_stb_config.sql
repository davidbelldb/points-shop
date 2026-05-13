CREATE TABLE IF NOT EXISTS stb_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  homepage_visible BOOLEAN NOT NULL DEFAULT FALSE,
  homepage_title TEXT NOT NULL DEFAULT 'Shut Katie''s Box',
  homepage_subtitle TEXT,
  homepage_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  felt_colour TEXT NOT NULL DEFAULT '#15b8a6',
  frame_colour TEXT NOT NULL DEFAULT '#0b8476',
  tile_colour TEXT NOT NULL DEFAULT '#0b8476',
  ink_colour TEXT NOT NULL DEFAULT '#faf5e6',
  hidden_message TEXT NOT NULL DEFAULT 'I_MISS_U!',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO stb_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
