-- Fixes to 155, plus highlight reels by audience.
--
-- 155 seeded the kids Shut the Box row by naming thirteen columns, which meant
-- every column added by a LATER migration — the camera position and FOV, and
-- the whole night-lighting block — silently fell back to its default. That's
-- why the kids board renders with different lighting and colours.
--
-- It also missed stb15_scattered_sets: the letters strewn around the board are
-- their own table, so the kids board still spelled out the grown-ups' message.

-- ── 1. Copy EVERY config column, whatever they are now ─────────────────────
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'stb15_config'
     -- id identifies the row, audience is what we're keying on, and the hidden
     -- message is the one thing that must NOT come across.
     AND column_name NOT IN ('id', 'audience', 'hidden_message', 'updated_at');

  IF cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE stb15_config k
          SET (%s) = (SELECT %s FROM stb15_config WHERE audience = ''adult'')
        WHERE k.audience = ''kids''', cols, cols);
  END IF;
END $$;

-- Belt and braces: the hidden message stays blank for kids.
UPDATE stb15_config SET hidden_message = '_______________' WHERE audience = 'kids';

-- ── 2. Scattered letter sets, per audience ─────────────────────────────────
ALTER TABLE stb15_scattered_sets ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stb15_scattered_sets_audience_check') THEN
    ALTER TABLE stb15_scattered_sets ADD CONSTRAINT stb15_scattered_sets_audience_check
      CHECK (audience IN ('adult', 'kids'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'stb15_scattered_sets_pkey'
       AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
  ) THEN
    ALTER TABLE stb15_scattered_sets DROP CONSTRAINT stb15_scattered_sets_pkey;
    ALTER TABLE stb15_scattered_sets ADD PRIMARY KEY (audience, ord);
  END IF;
END $$;

-- Blank and inactive, matching the column defaults, for you to fill in.
INSERT INTO stb15_scattered_sets (audience, ord, back, front, active)
SELECT 'kids', ord, '________', '_______', FALSE
  FROM stb15_scattered_sets WHERE audience = 'adult'
 ON CONFLICT (audience, ord) DO NOTHING;

-- ── 3. Highlight reels, per audience ───────────────────────────────────────
-- Existing reels are adult-only, so a kids account sees none until one is
-- tagged 'kids' or 'both'.
ALTER TABLE story_reels ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'story_reels_audience_check') THEN
    ALTER TABLE story_reels ADD CONSTRAINT story_reels_audience_check
      CHECK (audience IN ('adult', 'kids', 'both'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_story_reels_audience ON story_reels(audience);
