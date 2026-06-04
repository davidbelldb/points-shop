-- Lamp X/Z position controls for night lighting
ALTER TABLE stb15_config
  ADD COLUMN IF NOT EXISTS night_lamp_x FLOAT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_lamp_z FLOAT NOT NULL DEFAULT 0;
