-- Ducky Derby: admin-configurable buoy colour (applies to every buoy in a race).
ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS buoy_colour TEXT NOT NULL DEFAULT '#e0322e';
