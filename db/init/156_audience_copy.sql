-- Audience-scoped copy.
--
-- Settings become (audience, key) rather than just key, with a fallback: if a
-- kids account has no override for a key, it gets the adult value. That means
-- only the wording that actually differs needs a second row.
--
-- It also gives the hardcoded labels ("safe pocket") a home, so the same screen
-- can say "safe pocket" for David and "basket" for George.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_audience_check') THEN
    ALTER TABLE settings ADD CONSTRAINT settings_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'settings_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
  ) THEN
    ALTER TABLE settings DROP CONSTRAINT settings_pkey;
    ALTER TABLE settings ADD PRIMARY KEY (audience, key);
  END IF;
END $$;

-- Label keys the apps read. Seeded for the adult audience with the wording
-- that's currently hardcoded in the React app, so nothing visibly changes.
INSERT INTO settings (audience, key, value) VALUES
  ('adult', 'basket_label',      'safe pocket'),
  ('adult', 'basket_add_label',  'Add to safe pocket'),
  ('adult', 'basket_empty_text', 'Nothing in here yet.'),
  ('adult', 'checkout_label',    'Place order'),
  ('adult', 'products_title',    'Latest products'),
  ('adult', 'order_done_text',   'Order placed.')
ON CONFLICT (audience, key) DO NOTHING;

-- The kids overrides: plain words, friendly tone.
INSERT INTO settings (audience, key, value) VALUES
  ('kids', 'shop_name',        'George''s Shop'),
  ('kids', 'hero_title',       'Hello George!'),
  ('kids', 'hero_subtitle',    'Spend your points on something brilliant.'),
  ('kids', 'basket_label',     'basket'),
  ('kids', 'basket_add_label', 'Add to basket'),
  ('kids', 'basket_empty_text','Your basket is empty. Go and find something!'),
  ('kids', 'checkout_label',   'Get it!'),
  ('kids', 'products_title',   'Things to get'),
  ('kids', 'order_done_text',  'All done! That is on its way.'),
  ('kids', 'games_title',      'Games'),
  ('kids', 'games_subtitle',   'Have a go!')
ON CONFLICT (audience, key) DO NOTHING;
