-- Link shopping trips to the calendar event they mirror — the backbone of
-- bi-directional snack syncing (event snacks ↔ trip items).
ALTER TABLE shopping_trips
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS shopping_trips_event_idx ON shopping_trips (event_id);
