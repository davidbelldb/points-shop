-- Ducky Derby B2: admin-editable commentary, banner placement & colour, lily pads.

-- Admin-editable race-commentary filler lines (shown between the scripted beats).
-- {duck} is substituted with a random racer's name at runtime.
CREATE TABLE IF NOT EXISTS ducky_commentary (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 16),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_commentary (ord, text, active) VALUES
  (1,  'It''s a cracking pace out there!', TRUE),
  (2,  '{duck} is really digging in!', TRUE),
  (3,  'The crowd is on its feet!', TRUE),
  (4,  '{duck} fancies this one!', TRUE),
  (5,  'They''re bunched up tight!', TRUE),
  (6,  'What a contest, folks!', TRUE),
  (7,  '{duck} won''t let this slip!', TRUE),
  (8,  'Pure drama on the water!', TRUE),
  (9,  '', FALSE), (10, '', FALSE), (11, '', FALSE), (12, '', FALSE),
  (13, '', FALSE), (14, '', FALSE), (15, '', FALSE), (16, '', FALSE)
ON CONFLICT (ord) DO NOTHING;

-- Banners can be planted on the top or bottom bank, with a chosen text colour.
ALTER TABLE ducky_banners
  ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'top',
  ADD COLUMN IF NOT EXISTS colour    TEXT NOT NULL DEFAULT '#1f2937';

-- Per-duck lily-pad speed boosts for a race.
ALTER TABLE ducky_races
  ADD COLUMN IF NOT EXISTS lilypads JSONB NOT NULL DEFAULT '{}';
