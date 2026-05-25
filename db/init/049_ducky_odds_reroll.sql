-- Ducky Derby: track when the automatic odds re-roll last ran.
ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS odds_updated_at TIMESTAMPTZ;
