-- Daily Weather Forecast Scroll.
--
-- A scheduled scroll, sent from the admin (David) to their partner on the
-- configured days/times, carrying a 3-line weather forecast for a chosen
-- location (Blinco Grove, Cambridge by default). It flies + narrates like any
-- scroll but is shown as coming "from the Three-Eyed Crow" rather than a street.

-- Display override: when set, the scroll header + Live Activity show this label
-- ("the Three-Eyed Crow") instead of the geographic origin_label. NULL for
-- normal scrolls, which keep showing where they were sent from.
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS from_label TEXT;

-- Single-row config (same pattern as scrolls_settings / sneaky_button_config).
CREATE TABLE IF NOT EXISTS forecast_settings (
  id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  -- Days of week the forecast is sent (0 = Sun … 6 = Sat).
  send_days       INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,0]::INTEGER[],
  -- One or more "HH:MM" send times (Europe/London).
  send_times      JSONB NOT NULL DEFAULT '["07:30"]'::jsonb,
  -- Who receives it: 'partner' (Katie), 'me' (David only — for testing, never
  -- notifies the partner), or 'both'.
  recipient       TEXT NOT NULL DEFAULT 'partner' CHECK (recipient IN ('partner','me','both')),
  -- Forecast location (weather lookup + the scroll's landing point). Set via the
  -- same Nominatim lookup the scroll composer uses.
  location_label  TEXT NOT NULL DEFAULT 'Blinco Grove',
  location_lat    DOUBLE PRECISION NOT NULL DEFAULT 52.1872,
  location_lng    DOUBLE PRECISION NOT NULL DEFAULT 0.1385,
  -- Guard so each slot only fires once.
  last_sent_slot  TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO forecast_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
