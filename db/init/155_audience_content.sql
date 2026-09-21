-- Per-audience content for the home page: hero slides, the Sneaky Button and
-- Shut the Box 15.
--
-- Same idea as 154: a kids account sees its own set. Everything that already
-- exists becomes 'adult', so the web app is untouched. Hero slides also allow
-- 'both' for anything everyone should see.

-- ── Hero slides ────────────────────────────────────────────────────────────
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hero_slides_audience_check') THEN
    ALTER TABLE hero_slides ADD CONSTRAINT hero_slides_audience_check
      CHECK (audience IN ('adult', 'kids', 'both'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hero_slides_audience
  ON hero_slides(audience, placement) WHERE is_active = TRUE;

-- ── Sneaky Button ──────────────────────────────────────────────────────────
-- Was a single row pinned to id = 1; now one row per audience.
ALTER TABLE sneaky_button_config ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sneaky_button_config_audience_check') THEN
    ALTER TABLE sneaky_button_config ADD CONSTRAINT sneaky_button_config_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;

  -- Drop the id = 1 straitjacket and re-key on audience.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sneaky_button_config_id_check') THEN
    ALTER TABLE sneaky_button_config DROP CONSTRAINT sneaky_button_config_id_check;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sneaky_button_config_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
       AND EXISTS (
         SELECT 1 FROM pg_attribute
          WHERE attrelid = conrelid AND attnum = ANY(conkey) AND attname = 'id'
       )
  ) THEN
    ALTER TABLE sneaky_button_config DROP CONSTRAINT sneaky_button_config_pkey;
    ALTER TABLE sneaky_button_config ADD PRIMARY KEY (audience);
  END IF;
END $$;

-- The kids button starts from the same settings, so it behaves sensibly on day one.
INSERT INTO sneaky_button_config (id, audience, homepage_visible, homepage_days, animal_type, button_label)
SELECT 2, 'kids', homepage_visible, homepage_days, animal_type, button_label
  FROM sneaky_button_config WHERE audience = 'adult'
 ON CONFLICT (audience) DO NOTHING;

-- ── Shut the Box 15 ────────────────────────────────────────────────────────
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stb15_config_audience_check') THEN
    ALTER TABLE stb15_config ADD CONSTRAINT stb15_config_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stb15_config_id_check') THEN
    ALTER TABLE stb15_config DROP CONSTRAINT stb15_config_id_check;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stb15_config_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
       AND EXISTS (
         SELECT 1 FROM pg_attribute
          WHERE attrelid = conrelid AND attnum = ANY(conkey) AND attname = 'id'
       )
  ) THEN
    ALTER TABLE stb15_config DROP CONSTRAINT stb15_config_pkey;
    ALTER TABLE stb15_config ADD PRIMARY KEY (audience);
  END IF;
END $$;

-- Kids config: same board and colours, but the hidden message blanked out so
-- nothing personal carries over. Fill it in from the admin panel.
INSERT INTO stb15_config (
  id, audience, homepage_visible, homepage_title, homepage_subtitle, homepage_days,
  felt_colour, frame_colour, tile_colour, ink_colour, hidden_message,
  dice_colour, pip_colour, table_colour
)
SELECT 2, 'kids', homepage_visible, homepage_title, homepage_subtitle, homepage_days,
       felt_colour, frame_colour, tile_colour, ink_colour, '_______________',
       dice_colour, pip_colour, table_colour
  FROM stb15_config WHERE audience = 'adult'
 ON CONFLICT (audience) DO NOTHING;

-- Tile messages: one set per audience, the kids set blank and inactive.
ALTER TABLE stb15_tile_messages ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stb15_tile_messages_audience_check') THEN
    ALTER TABLE stb15_tile_messages ADD CONSTRAINT stb15_tile_messages_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stb15_tile_messages_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
  ) THEN
    ALTER TABLE stb15_tile_messages DROP CONSTRAINT stb15_tile_messages_pkey;
    ALTER TABLE stb15_tile_messages ADD PRIMARY KEY (audience, ord);
  END IF;
END $$;

INSERT INTO stb15_tile_messages (audience, ord, message, active)
SELECT 'kids', ord, '_______________', FALSE
  FROM stb15_tile_messages WHERE audience = 'adult'
 ON CONFLICT (audience, ord) DO NOTHING;
