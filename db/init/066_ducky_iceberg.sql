-- Ducky Derby: iceberg obstacle — admin-toggleable, size 1-10.
-- When enabled, one non-winning duck strikes the iceberg and sinks each race.

ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS iceberg_enabled BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS iceberg_size    SMALLINT NOT NULL DEFAULT 5;

-- Store the world-fraction position of the iceberg for each race (null = no iceberg).
ALTER TABLE ducky_races
  ADD COLUMN IF NOT EXISTS iceberg_at FLOAT;
