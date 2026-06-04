-- Night lighting configuration for STB15
ALTER TABLE stb15_config
  ADD COLUMN IF NOT EXISTS night_mode_force      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS night_start_hour      INT     NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS night_end_hour        INT     NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS night_lamp_intensity  FLOAT   NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS night_lamp_colour     TEXT    NOT NULL DEFAULT '#fff5e0',
  ADD COLUMN IF NOT EXISTS night_blue_intensity  FLOAT   NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS night_blue_colour     TEXT    NOT NULL DEFAULT '#2244aa';
