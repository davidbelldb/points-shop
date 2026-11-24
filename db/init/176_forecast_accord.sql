-- ---------------------------------------------------------------------------
-- Weather/forecast destination → Accord Puducherry (Squishy's hotel).
-- The bird lands here and the forecast is pulled for this exact point; the
-- origin is derived ~6 km west of it (see forecastOrigin). Single-row config.
-- ---------------------------------------------------------------------------
UPDATE forecast_settings
   SET location_label = 'Accord Puducherry',
       location_lat   = 11.941403686819902,
       location_lng   = 79.80759831283851,
       updated_at     = NOW()
 WHERE id = 1;
