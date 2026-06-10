-- Per-cell formatting for Sneaky Spreadsheets.
-- formats = { "row,col": { "b": true, "i": true, "u": true, "fill": "#f968b7" }, ... }
ALTER TABLE spreadsheet_tabs
  ADD COLUMN IF NOT EXISTS formats JSONB NOT NULL DEFAULT '{}'::jsonb;
