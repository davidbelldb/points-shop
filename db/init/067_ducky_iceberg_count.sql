-- Ducky Derby: separate iceberg count from iceberg visual size.
-- iceberg_size (1-10) controls display dimensions; iceberg_count (0-10) controls
-- how many icebergs can appear per race (0 = effectively disabled).

ALTER TABLE ducky_config
  ADD COLUMN IF NOT EXISTS iceberg_count SMALLINT NOT NULL DEFAULT 3;
