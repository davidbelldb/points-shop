-- Sneaky shopping list — shared between both accounts.
CREATE TABLE IF NOT EXISTS shopping_items (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  qty         INTEGER     NOT NULL DEFAULT 1,
  image_url   TEXT,
  barcode     TEXT,
  checked     BOOLEAN     NOT NULL DEFAULT FALSE,
  added_by    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_at  TIMESTAMPTZ
);

-- Purchase history — powers "your usuals" autocomplete suggestions.
-- Upserted every time an item is added; survives list clears.
CREATE TABLE IF NOT EXISTS shopping_history (
  name_key    TEXT PRIMARY KEY,          -- lower(trim(name))
  name        TEXT        NOT NULL,
  image_url   TEXT,
  barcode     TEXT,
  times_used  INTEGER     NOT NULL DEFAULT 1,
  last_used   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
