-- Per-event icon key (matches the client's eventIcons registry).
-- Nullable / no default — UI falls back to the generic calendar glyph
-- when the column is null.
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS icon TEXT;
