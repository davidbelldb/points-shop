-- Caches the real street names sampled along the crow's flight path (≈30/55/80%
-- of the way from origin to destination), reverse-geocoded once at send time.
-- The Live Activity narrates these as the crow passes "over" each one.
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS route_streets JSONB;
