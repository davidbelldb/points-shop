-- ---------------------------------------------------------------------------
-- Send Squishy's daily weather roll at 08:00 her local time. send_times are
-- interpreted in forecast_settings.timezone, already set to Asia/Kolkata (IST,
-- UTC+5.5) by 174 — so 08:00 here fires at 08:00 in Pondicherry, not the UK.
-- (Was the old 07:30 default.)
-- ---------------------------------------------------------------------------
UPDATE forecast_settings
   SET send_times = '["08:00"]'::jsonb,
       updated_at = NOW()
 WHERE id = 1;
