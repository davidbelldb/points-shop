-- ---------------------------------------------------------------------------
-- Country-level flight narration. route_countries holds the ~6 countries the
-- crow passes over (sampled at COUNTRY_FRACS and reverse-geocoded at send time;
-- null entries = open sea). la_country_step records the highest country beat
-- already pushed to the Live Activity subtitle, independent of the 3 visual
-- waypoint nodes (la_phase).
-- ---------------------------------------------------------------------------
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS route_countries  JSONB,
  ADD COLUMN IF NOT EXISTS la_country_step  INTEGER NOT NULL DEFAULT 0;
