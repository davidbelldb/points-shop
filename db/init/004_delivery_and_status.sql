DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

UPDATE orders SET status = 'placed'     WHERE status IN ('pending','confirmed');
UPDATE orders SET status = 'dispatched' WHERE status = 'shipped';

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('placed','dispatched','delivered','cancelled'));
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'placed';

CREATE TABLE IF NOT EXISTS delivery_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    points      INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO delivery_options (name, points, sort_order) VALUES
  ('Whenever I feel like it',          0, 0),
  ('Collect at work',                  4, 1),
  ('To your door on a satin pillow',   8, 2)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE baskets
  ADD COLUMN IF NOT EXISTS delivery_option_id UUID
    REFERENCES delivery_options(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_option_id UUID
    REFERENCES delivery_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS delivery_points INTEGER NOT NULL DEFAULT 0;

UPDATE baskets b
   SET delivery_option_id = (
        SELECT id FROM delivery_options
         WHERE is_active = TRUE
         ORDER BY sort_order, points
         LIMIT 1)
 WHERE b.delivery_option_id IS NULL;
