CREATE TABLE IF NOT EXISTS wheels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL DEFAULT 'Wheel of Misfortune',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wheel_segments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id      UUID NOT NULL REFERENCES wheels(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#14b8a6',
  award_type    TEXT NOT NULL DEFAULT 'label',
  product_id    UUID REFERENCES products(id),
  points_delta  INTEGER,
  forfeit_text  TEXT,
  order_index   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wheel_spins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wheel_id       UUID NOT NULL REFERENCES wheels(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment_id     UUID REFERENCES wheel_segments(id),
  award_summary  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wheel_segments_wheel ON wheel_segments (wheel_id, order_index);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_account  ON wheel_spins (account_id, created_at);
INSERT INTO wheels (name, is_active)
  SELECT 'Wheel of Misfortune', true
  WHERE NOT EXISTS (SELECT 1 FROM wheels);
