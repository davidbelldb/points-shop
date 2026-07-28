-- Shared floorplan calibration for the "Marauder's Map" indoor view. Previously the
-- placement (centre, width, rotation, opacity, map heading, default view) lived only in
-- each device's localStorage, so David's desktop calibration never reached the iOS app.
-- One row, one JSON blob, so every device pulls the same locked-in placement.

CREATE TABLE IF NOT EXISTS footprint_floorplan (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO footprint_floorplan (id, config) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
