-- ---------------------------------------------------------------------------
-- Daily forecast scroll → Pondicherry, for Squishy's trip.
--
-- Points the forecast at central Pondicherry (Puducherry), India, so the weather
-- is for where she actually is. The crow origin is derived in code as ~10 km due
-- north of this location (see forecastOrigin), so it deploys 10 km outside
-- Pondicherry and flies south into the centre.
--
-- recipient = 'partner' makes sure only she receives it (never David).
--
-- Single-row forecast config (id = 1). To revert when she's home, set these back
-- to the home location.
-- ---------------------------------------------------------------------------
UPDATE forecast_settings
   SET location_label = 'Pondicherry',
       location_lat   = 11.9340,
       location_lng   = 79.8300,
       recipient      = 'partner',
       updated_at     = NOW()
 WHERE id = 1;
