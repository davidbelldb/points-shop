-- "Marauder's Map" footprints — a fading trail of a person's positions. One
-- engine serves BOTH outdoor (GPS, live now) and indoor (UWB, later). David
-- broadcasts; he and Katie both watch. Each mode is configured independently.

CREATE TABLE IF NOT EXISTS footprint_pings (
  id           BIGSERIAL PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('indoor','outdoor')),
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS footprint_pings_lookup
  ON footprint_pings (account_id, mode, recorded_at DESC);

-- Per-mode config (one row each), independently tunable:
--   trail_length = max footprints kept in the trail,
--   fade_seconds = how long a print lingers before fading fully out,
--   spacing_m    = distance between dropped footprints along the path.
CREATE TABLE IF NOT EXISTS footprint_settings (
  mode         TEXT PRIMARY KEY CHECK (mode IN ('indoor','outdoor')),
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  trail_length INTEGER NOT NULL DEFAULT 100,
  fade_seconds INTEGER NOT NULL DEFAULT 900,
  spacing_m    DOUBLE PRECISION NOT NULL DEFAULT 10,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO footprint_settings (mode, enabled, trail_length, fade_seconds, spacing_m) VALUES
  ('outdoor', TRUE,  200, 900, 15),
  ('indoor',  FALSE, 40,  300, 0.6)
ON CONFLICT (mode) DO NOTHING;
