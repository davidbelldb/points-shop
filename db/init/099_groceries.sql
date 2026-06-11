-- House grocery catalogue — hand-curated products (photos screenshotted from
-- the Waitrose app, etc.) managed via /admin. Surfaced in the shopping-list
-- lookup and calendar snack inputs on type; barcode scans check here first.
CREATE TABLE IF NOT EXISTS groceries (
  id                 SERIAL PRIMARY KEY,
  name               TEXT        NOT NULL,
  image_url          TEXT,                  -- product photo
  barcode            TEXT,                  -- digits, used by the scanner
  barcode_image_url  TEXT,                  -- photo of the barcode itself
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS groceries_barcode_idx
  ON groceries (barcode) WHERE barcode IS NOT NULL;
