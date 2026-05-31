-- Ducky Derby: add iceberg_size_min so each iceberg can be a random size
-- within [iceberg_size_min, iceberg_size] rather than all the same size.

ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS iceberg_size_min SMALLINT NOT NULL DEFAULT 2;
