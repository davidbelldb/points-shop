-- Audiences.
--
-- Some accounts see a kid-safe version of the app: different products, different
-- Ducky Derby words, and (as they land) their own hero slides, Sneaky Button and
-- Shut the Box. This is a property of the ACCOUNT, not the app — so David or
-- Katie logging into the native app still get the normal thing, and George gets
-- the kid version wherever he signs in.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_audience_check') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;
END $$;

UPDATE accounts SET audience = 'kids' WHERE LOWER(username) = 'george';

-- Products are tagged with who they're for. 'both' covers the things everyone
-- can buy (sweets, days out) so nothing has to be entered twice. Everything that
-- already exists stays adult-only, so George's shop starts deliberately empty
-- rather than inheriting the current catalogue.
ALTER TABLE products ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_audience_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_audience_check
      CHECK (audience IN ('adult', 'kids', 'both'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_audience ON products(audience) WHERE is_active = TRUE;
