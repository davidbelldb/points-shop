-- Ink colour for tile/text in night mode (warm amber to match lamp glow)
ALTER TABLE stb15_config
  ADD COLUMN IF NOT EXISTS night_ink_colour TEXT NOT NULL DEFAULT '#d4882a';
