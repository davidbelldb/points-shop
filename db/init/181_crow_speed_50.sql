-- ---------------------------------------------------------------------------
-- Bump the crow's cruising speed 45 -> 50 km/h. Flight time is distance / speed
-- (speed_multiplier stays 1 = true-raven time), so every flight gets ~10% shorter.
-- flightSeconds() reads crow_speed_kmh from this settings row at send time.
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET crow_speed_kmh = 50
 WHERE id = TRUE;
