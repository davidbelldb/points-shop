CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('shop_name',     'Sneaky Points'),
  ('hero_title',    'Welcome to Sneaky Points'),
  ('hero_subtitle', 'The shop of your dreams, funded by your nightmares.'),
  ('logo_url',      NULL)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS discount_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT UNIQUE NOT NULL,
    description     TEXT,
    discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value  INTEGER NOT NULL CHECK (discount_value > 0),
    max_uses        INTEGER,
    uses_count      INTEGER NOT NULL DEFAULT 0,
    valid_from      TIMESTAMPTZ,
    valid_until     TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE baskets
    ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id) ON DELETE SET NULL;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS discount_code_id        UUID REFERENCES discount_codes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_points         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_code_snapshot  TEXT;
