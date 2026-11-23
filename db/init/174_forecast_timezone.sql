-- ---------------------------------------------------------------------------
-- Forecast send-time timezone.
--
-- The daily forecast's send_times are now interpreted in the forecast LOCATION's
-- own local time (this column) rather than always Europe/London. So "08:00" fires
-- at 08:00 local wherever the forecast is for — the same clock reading as UK local,
-- but in Pondicherry's timezone while Squishy's there.
--
-- Default stays Europe/London; set to Asia/Kolkata for the Pondicherry forecast.
-- Single-row config (id = 1). Revert the value to Europe/London when she's home.
-- ---------------------------------------------------------------------------
ALTER TABLE forecast_settings
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/London';

UPDATE forecast_settings
   SET timezone   = 'Asia/Kolkata',
       updated_at = NOW()
 WHERE id = 1;
