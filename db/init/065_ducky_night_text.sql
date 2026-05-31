-- Ducky Derby: separate night-mode speech phrases, race commentary, and pre-race intro.
-- When the app is in dark mode these pools are used instead of the day-mode equivalents.

CREATE TABLE IF NOT EXISTS ducky_night_phrases (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 12),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_night_phrases (ord, text, active) VALUES
  (1,  'Darkness cannot stop me!',       TRUE),
  (2,  'I race best by moonlight...',    TRUE),
  (3,  'Can''t see a thing. Perfect.',   TRUE),
  (4,  'Night swimming hits different',  TRUE),
  (5,  '', FALSE), (6,  '', FALSE), (7,  '', FALSE), (8,  '', FALSE),
  (9,  '', FALSE), (10, '', FALSE), (11, '', FALSE), (12, '', FALSE)
ON CONFLICT (ord) DO NOTHING;

CREATE TABLE IF NOT EXISTS ducky_night_commentary (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 16),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_night_commentary (ord, text, active) VALUES
  (1,  'A moonlit thriller unfolding on the water!',   TRUE),
  (2,  '{duck} is a shadow in the night!',             TRUE),
  (3,  'The crowd falls silent in the darkness...',    TRUE),
  (4,  '{duck} is hunting by feel alone!',             TRUE),
  (5,  'Impossible to separate them in this light!',   TRUE),
  (6,  'Only the splashing tells the story tonight!',  TRUE),
  (7,  '{duck} glides like a ghost!',                  TRUE),
  (8,  'Eerie. Brilliant. Terrifying.',                TRUE),
  (9,  '', FALSE), (10, '', FALSE), (11, '', FALSE), (12, '', FALSE),
  (13, '', FALSE), (14, '', FALSE), (15, '', FALSE), (16, '', FALSE)
ON CONFLICT (ord) DO NOTHING;

CREATE TABLE IF NOT EXISTS ducky_night_intro (
  ord INTEGER PRIMARY KEY CHECK (ord BETWEEN 1 AND 8),
  text TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO ducky_night_intro (ord, text, active) VALUES
  (1,  'Welcome to the Midnight Ducky Derby...',        TRUE),
  (2,  'The river is dark. The ducks are ready.',       TRUE),
  (3,  'Rumour has it {duck} trained in the dark',      TRUE),
  (4,  'Pick your duck. Trust your instincts.',         TRUE),
  (5,  '', FALSE), (6, '', FALSE), (7, '', FALSE), (8, '', FALSE)
ON CONFLICT (ord) DO NOTHING;
