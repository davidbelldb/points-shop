-- Ducky Derby content variants.
--
-- The native iOS app (com.david.sneakysocial) shows a kid-friendly derby while
-- the Capacitor app keeps the original. Only the WORDS differ: the ducks, their
-- colours, odds, form and the race maths are all shared, so both apps race the
-- same field and the ledger is untouched.
--
-- Every text table gains `variant`, and its primary key becomes (variant, ord).
-- Existing rows become 'original', so the web app carries on unchanged.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ducky_banners', 'ducky_phrases', 'ducky_commentary', 'ducky_intro',
    'ducky_night_phrases', 'ducky_night_commentary', 'ducky_night_intro'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT ''original''', t);

    -- Constrain to the two known variants.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = t || '_variant_check'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (variant IN (''original'', ''kids''))',
        t, t || '_variant_check');
    END IF;

    -- Re-key on (variant, ord) so each variant gets its own full set of rows.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = t || '_pkey'
         AND (SELECT COUNT(*) FROM unnest(conkey)) = 1
    ) THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, t || '_pkey');
      EXECUTE format('ALTER TABLE %I ADD PRIMARY KEY (variant, ord)', t);
    END IF;

    -- Give the kids variant a row for every ord the original has, empty and
    -- inactive, so the seeding below can simply update the ones it wants.
    EXECUTE format(
      'INSERT INTO %I (variant, ord, text, active)
       SELECT ''kids'', ord, '''', FALSE FROM %I WHERE variant = ''original''
       ON CONFLICT (variant, ord) DO NOTHING', t, t);
  END LOOP;
END $$;

-- Banners carry placement and colour too; copy those defaults across.
UPDATE ducky_banners k
   SET placement = o.placement, colour = o.colour
  FROM ducky_banners o
 WHERE k.variant = 'kids' AND o.variant = 'original' AND k.ord = o.ord;

-- ---------------------------------------------------------------------------
-- Kid-friendly content
-- ---------------------------------------------------------------------------

UPDATE ducky_banners SET text = v.text, active = TRUE, placement = v.placement
  FROM (VALUES
    (1, 'WELCOME TO THE DERBY', 'top'),
    (2, 'GO DUCKS GO!', 'top'),
    (3, 'BREAD THIS WAY', 'bottom'),
    (4, 'QUACK QUACK!', 'bottom')
  ) AS v(ord, text, placement)
 WHERE ducky_banners.variant = 'kids' AND ducky_banners.ord = v.ord;

UPDATE ducky_phrases SET text = v.text, active = TRUE
  FROM (VALUES
    (1, 'Here I go!'),
    (2, 'Quack quack!'),
    (3, 'Wheee!'),
    (4, 'Splish splash!'),
    (5, 'Wait for me!'),
    (6, 'Paddle paddle paddle!'),
    (7, 'Is that bread?'),
    (8, 'Look at me go!'),
    (9, 'Whoops!'),
    (10, 'This water is lovely!'),
    (11, 'Nearly there!'),
    (12, 'Best day ever!')
  ) AS v(ord, text)
 WHERE ducky_phrases.variant = 'kids' AND ducky_phrases.ord = v.ord;

UPDATE ducky_commentary SET text = v.text, active = TRUE
  FROM (VALUES
    (1,  'They are all paddling like mad!'),
    (2,  '{duck} is really going for it!'),
    (3,  'What a splash from {duck}!'),
    (4,  '{duck} and {duck2} are side by side!'),
    (5,  'The bread is still out in front!'),
    (6,  '{duck} gives a big happy quack!'),
    (7,  'Lovely paddling from {duck}!'),
    (8,  '{duck} is catching up fast!'),
    (9,  'Everyone is having a wonderful time!'),
    (10, '{duck} can see the finish line!'),
    (11, 'Wings up from {duck}!'),
    (12, '{duck2} is not giving up!'),
    (13, 'What a race this is!'),
    (14, '{duck} takes the inside line!'),
    (15, 'The ducks are loving this!'),
    (16, 'Not far to go now!')
  ) AS v(ord, text)
 WHERE ducky_commentary.variant = 'kids' AND ducky_commentary.ord = v.ord;

UPDATE ducky_intro SET text = v.text, active = TRUE
  FROM (VALUES
    (1, 'Welcome to the Ducky Derby!'),
    (2, 'The ducks are lining up...'),
    (3, '{duck} looks ready to go!'),
    (4, '{duck} and {duck2} are having a chat.'),
    (5, 'Pick your favourite duck!'),
    (6, 'The bread is on its way out.'),
    (7, 'Is everybody ready?'),
    (8, 'Good luck!')
  ) AS v(ord, text)
 WHERE ducky_intro.variant = 'kids' AND ducky_intro.ord = v.ord;

UPDATE ducky_night_phrases SET text = v.text, active = TRUE
  FROM (VALUES
    (1, 'Night paddle!'),
    (2, 'The moon is out!'),
    (3, 'Sleepy quack...'),
    (4, 'I can see stars!'),
    (5, 'Splash in the dark!'),
    (6, 'Who turned the lights off?'),
    (7, 'Nearly bedtime!'),
    (8, 'Shhh, everyone is sleeping!'),
    (9, 'Twinkle twinkle!'),
    (10, 'It is cosy out here.'),
    (11, 'One more race!'),
    (12, 'Goodnight ducks!')
  ) AS v(ord, text)
 WHERE ducky_night_phrases.variant = 'kids' AND ducky_night_phrases.ord = v.ord;

UPDATE ducky_night_commentary SET text = v.text, active = TRUE
  FROM (VALUES
    (1,  'A lovely night for a race!'),
    (2,  '{duck} is paddling under the stars!'),
    (3,  'The moon is watching {duck}!'),
    (4,  '{duck} and {duck2} are neck and neck!'),
    (5,  'Everyone is in their pyjamas!'),
    (6,  '{duck} gives a sleepy quack!'),
    (7,  'The water is lovely and still!'),
    (8,  '{duck} is wide awake!'),
    (9,  'What a peaceful evening!'),
    (10, '{duck} is nearly home!'),
    (11, 'A big yawn from {duck2}!'),
    (12, 'The stars are out for this one!'),
    (13, 'Softly does it, {duck}!'),
    (14, 'Almost bedtime, ducks!'),
    (15, '{duck} finds a burst of energy!'),
    (16, 'Nearly at the end now!')
  ) AS v(ord, text)
 WHERE ducky_night_commentary.variant = 'kids' AND ducky_night_commentary.ord = v.ord;

UPDATE ducky_night_intro SET text = v.text, active = TRUE
  FROM (VALUES
    (1, 'Welcome to the night-time Derby!'),
    (2, 'The ducks are up past their bedtime.'),
    (3, '{duck} has brought a nightlight.'),
    (4, '{duck} and {duck2} are yawning already.'),
    (5, 'Pick your favourite duck!'),
    (6, 'The moon is nice and bright tonight.'),
    (7, 'Everybody ready?'),
    (8, 'Good luck, sleepy ducks!')
  ) AS v(ord, text)
 WHERE ducky_night_intro.variant = 'kids' AND ducky_night_intro.ord = v.ord;
