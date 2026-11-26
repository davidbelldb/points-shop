-- ---------------------------------------------------------------------------
-- Per-country timing for the Live Activity country narration. route_country_fracs
-- is a JSONB array, one fraction-of-journey (0..1) per entry in route_countries,
-- marking where the crow actually crosses that country. When present, each beat
-- fires as the bird reaches that fraction (so narration tracks the real path);
-- when NULL, the beats fall back to even spacing. Hand-set for bespoke routes.
-- ---------------------------------------------------------------------------
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS route_country_fracs JSONB;
