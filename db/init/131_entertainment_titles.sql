-- Manually-curated titles for the "Wheel of Entertainment" — admin-managed
-- extras that sit alongside the invited (invite_david) rewatch-list titles on
-- the wheel. The "Bum Show" no-prize segment is synthesised at read time and
-- isn't stored here.
CREATE TABLE IF NOT EXISTS entertainment_titles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
