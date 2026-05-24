-- Ducky Derby: admin-configurable number of buoys per race (0 turns them off).
ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS buoy_count INTEGER NOT NULL DEFAULT 4;
