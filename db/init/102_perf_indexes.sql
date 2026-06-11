-- Cheap insurance indexes for the hottest lookups as tables grow.
CREATE INDEX IF NOT EXISTS shopping_items_trip_idx
  ON shopping_items (trip_id);

CREATE INDEX IF NOT EXISTS messages_recipient_unread_idx
  ON messages (recipient_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS calendar_events_starts_idx
  ON calendar_events (starts_at);
