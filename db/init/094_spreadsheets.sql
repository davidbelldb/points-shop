-- Sneaky Spreadsheets — shared workbook, one row per tab.
-- Both accounts see and edit every tab (same trust model as shared notes).
CREATE TABLE IF NOT EXISTS spreadsheet_tabs (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL DEFAULT 'Sheet',
  position    INTEGER     NOT NULL DEFAULT 0,
  columns     JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- ["Name", "Date", ...]
  data        JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [["row1col1", ...], ...]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
