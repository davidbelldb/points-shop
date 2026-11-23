-- ---------------------------------------------------------------------------
-- Crow flight: switch to TRUE raven time.
--
-- Drops the 60x time compression (speed_multiplier -> 1) so a scroll takes as
-- long as a real raven at crow_speed_kmh (45 km/h) would take to fly the
-- great-circle distance. Local Cambridge hops become a few minutes; a long haul
-- like Cambridge -> Chennai (~8,190 km) becomes ~7.5 days.
--
-- The old 24h cap would have chopped that back to a day, so we raise
-- max_flight_seconds to 1,728,000s (20 days) — comfortably beyond the farthest
-- point on Earth from Cambridge (~19,000 km ≈ 18.8 days at 45 km/h), i.e. an
-- effective "no cap" for any real destination.
--
-- Single-row config (id = TRUE), so this updates the one live settings row.
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET speed_multiplier   = 1,
       max_flight_seconds = 1728000,
       updated_at         = NOW()
 WHERE id = TRUE;
