-- Watch list v2: split into "to rewatch" (seen before) and "to watch" (new),
-- and make the invite flag generic (invite the partner, not specifically David).

ALTER TABLE rewatch_items
  ADD COLUMN IF NOT EXISTS seen_before BOOLEAN NOT NULL DEFAULT TRUE;

-- Rename invite_david -> invite_partner (guarded so it's safe to re-run).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rewatch_items' AND column_name = 'invite_david'
  ) THEN
    ALTER TABLE rewatch_items RENAME COLUMN invite_david TO invite_partner;
  END IF;
END $$;
