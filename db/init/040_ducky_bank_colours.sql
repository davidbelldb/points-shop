-- Ducky Derby: admin-configurable grass and mud bank colours.
ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS grass_colour TEXT NOT NULL DEFAULT '#5bbf3a',
  ADD COLUMN IF NOT EXISTS mud_colour TEXT NOT NULL DEFAULT '#6b4a2a';
