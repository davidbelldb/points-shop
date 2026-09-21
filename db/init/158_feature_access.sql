-- Feature access by audience — the default-deny layer.
--
-- Item-level `audience` columns (products, hero_slides, story_reels) decide
-- WHICH ROWS you see inside a feature. This table decides whether you can reach
-- the feature at all. A kids account gets only what is switched on here;
-- anything absent — including features not yet built — is invisible to them.

CREATE TABLE IF NOT EXISTS feature_access (
  feature    TEXT NOT NULL,
  audience   TEXT NOT NULL CHECK (audience IN ('adult', 'kids')),
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (feature, audience)
);

-- Adults keep everything.
INSERT INTO feature_access (feature, audience, enabled) VALUES
  ('shop', 'adult', TRUE), ('ducky_derby', 'adult', TRUE), ('shut_the_box', 'adult', TRUE),
  ('messaging', 'adult', TRUE), ('scrolls', 'adult', TRUE), ('stories', 'adult', TRUE),
  ('truth_or_dare', 'adult', TRUE), ('dirty_wordle', 'adult', TRUE), ('other_games', 'adult', TRUE),
  ('crossword', 'adult', TRUE), ('calendar', 'adult', TRUE), ('notes', 'adult', TRUE),
  ('audio_notes', 'adult', TRUE), ('timeline', 'adult', TRUE), ('watch_list', 'adult', TRUE),
  ('playlist', 'adult', TRUE), ('reviews', 'adult', TRUE), ('surveys', 'adult', TRUE),
  ('spreadsheets', 'adult', TRUE), ('on_my_way', 'adult', TRUE), ('calls', 'adult', TRUE),
  ('nfc', 'adult', TRUE), ('sneakyscapes', 'adult', TRUE), ('sneaky_button', 'adult', TRUE),
  ('hero', 'adult', TRUE), ('widgets', 'adult', TRUE)
ON CONFLICT (feature, audience) DO NOTHING;

-- Kids: the agreed allow-list on, everything else explicitly off.
INSERT INTO feature_access (feature, audience, enabled) VALUES
  ('shop', 'kids', TRUE),
  ('ducky_derby', 'kids', TRUE),
  ('shut_the_box', 'kids', TRUE),
  ('messaging', 'kids', TRUE),
  ('scrolls', 'kids', TRUE),

  ('stories', 'kids', FALSE),
  ('truth_or_dare', 'kids', FALSE),
  ('dirty_wordle', 'kids', FALSE),
  ('other_games', 'kids', FALSE),
  ('crossword', 'kids', FALSE),
  ('calendar', 'kids', FALSE),
  ('notes', 'kids', FALSE),
  ('audio_notes', 'kids', FALSE),
  ('timeline', 'kids', FALSE),
  ('watch_list', 'kids', FALSE),
  ('playlist', 'kids', FALSE),
  ('reviews', 'kids', FALSE),
  ('surveys', 'kids', FALSE),
  ('spreadsheets', 'kids', FALSE),
  ('on_my_way', 'kids', FALSE),
  ('calls', 'kids', FALSE),
  ('nfc', 'kids', FALSE),
  ('sneakyscapes', 'kids', FALSE),
  ('sneaky_button', 'kids', FALSE),
  ('hero', 'kids', FALSE),
  ('widgets', 'kids', FALSE)
ON CONFLICT (feature, audience) DO NOTHING;
