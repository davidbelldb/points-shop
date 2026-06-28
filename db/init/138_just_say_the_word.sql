-- Just Say The Word — a daily pronunciation game.
--
-- 5 words a day (same for both players). The player says each word aloud; Azure
-- Pronunciation Assessment scores it 0–100 and per-syllable, and points are
-- awarded per word: 100→16, 80–99→12, 60–79→8, 40–59→4, <40→0 (max 16/word).
-- Mirrors Dirty Wordle's schedule / results / series / leaderboard model.

-- ── Config (single row) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jstw_config (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled        BOOLEAN NOT NULL DEFAULT FALSE,   -- hidden/off until ready to test
  min_len        INTEGER NOT NULL DEFAULT 4,       -- word length (letters)
  max_len        INTEGER NOT NULL DEFAULT 10,
  min_syllables  INTEGER NOT NULL DEFAULT 1,       -- optional syllable band
  max_syllables  INTEGER NOT NULL DEFAULT 20,
  words_per_day  INTEGER NOT NULL DEFAULT 5,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO jstw_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Word bank ────────────────────────────────────────────────────────────────
-- syllables is an ordered JSON array of the spoken parts, e.g. ["en","tre","pre","neur"].
-- length + syllable_count are derived so the config bands filter automatically.
CREATE TABLE IF NOT EXISTS jstw_word_bank (
  word            TEXT PRIMARY KEY,
  syllables       JSONB NOT NULL,
  length          INTEGER GENERATED ALWAYS AS (char_length(word)) STORED,
  syllable_count  INTEGER GENERATED ALWAYS AS (jsonb_array_length(syllables)) STORED,
  used_on         DATE   -- NULL = available; set to the date it was served
);

-- ── Daily schedule: the N words served on each date (same for both players) ──
CREATE TABLE IF NOT EXISTS jstw_schedule (
  date        DATE    NOT NULL,
  word_index  INTEGER NOT NULL,        -- 0..words_per_day-1
  word        TEXT    NOT NULL,
  syllables   JSONB   NOT NULL,
  PRIMARY KEY (date, word_index)
);

-- ── Per-word results ─────────────────────────────────────────────────────────
-- syllables here is the scored breakdown: [{ "text":"en", "score":92 }, ...]
-- for the green/amber/red colouring on the leaderboard replay.
CREATE TABLE IF NOT EXISTS jstw_results (
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  word_index  INTEGER     NOT NULL,
  word        TEXT        NOT NULL,
  score       INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  points      INTEGER     NOT NULL DEFAULT 0,
  syllables   JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, date, word_index)
);
CREATE INDEX IF NOT EXISTS jstw_results_date_idx ON jstw_results (date);

-- ── Series (named monthly competitions; winner = most points in the window) ──
CREATE TABLE IF NOT EXISTS jstw_series (
  id         SERIAL PRIMARY KEY,
  name       TEXT   NOT NULL,
  starts_on  DATE   NOT NULL,
  ends_on    DATE   NOT NULL,
  UNIQUE (starts_on)
);

-- ── Seed a starter word bank (4–10 letters, with syllable splits) ────────────
INSERT INTO jstw_word_bank (word, syllables) VALUES
  ('ECHO','["ech","o"]'), ('IDEA','["i","de","a"]'), ('AQUA','["a","qua"]'),
  ('HALO','["ha","lo"]'), ('OMEN','["o","men"]'), ('OPAL','["o","pal"]'),
  ('MELON','["mel","on"]'), ('LEMON','["lem","on"]'), ('ROBOT','["ro","bot"]'),
  ('PIANO','["pi","a","no"]'), ('MANGO','["man","go"]'), ('VENOM','["ven","om"]'),
  ('COMET','["com","et"]'), ('LUNAR','["lu","nar"]'), ('ZEBRA','["ze","bra"]'),
  ('BANANA','["ba","na","na"]'), ('GUITAR','["gui","tar"]'), ('WALNUT','["wal","nut"]'),
  ('PURPLE','["pur","ple"]'), ('CIRCUS','["cir","cus"]'), ('DRAGON','["drag","on"]'),
  ('FROZEN','["fro","zen"]'), ('WIZARD','["wiz","ard"]'), ('ORANGE','["or","ange"]'),
  ('PLANET','["plan","et"]'),
  ('CAPSULE','["cap","sule"]'), ('OCTOPUS','["oc","to","pus"]'), ('DOLPHIN','["dol","phin"]'),
  ('GIRAFFE','["gi","raffe"]'), ('JOURNEY','["jour","ney"]'), ('PYRAMID','["pyr","a","mid"]'),
  ('MYSTERY','["mys","ter","y"]'), ('CRYSTAL','["crys","tal"]'), ('GATEWAY','["gate","way"]'),
  ('ELEPHANT','["el","e","phant"]'), ('DINOSAUR','["di","no","saur"]'),
  ('UMBRELLA','["um","brel","la"]'), ('COMPUTER','["com","pu","ter"]'),
  ('MOUNTAIN','["moun","tain"]'), ('SANDWICH','["sand","wich"]'),
  ('TRIANGLE','["tri","an","gle"]'), ('HOSPITAL','["hos","pi","tal"]'),
  ('CHOCOLATE','["choc","o","late"]'), ('ADVENTURE','["ad","ven","ture"]'),
  ('BUTTERFLY','["but","ter","fly"]'), ('CROCODILE','["croc","o","dile"]'),
  ('DANGEROUS','["dan","ger","ous"]'), ('WONDERFUL','["won","der","ful"]'),
  ('ASTRONAUT','["as","tro","naut"]'), ('CHEMISTRY','["chem","is","try"]'),
  ('FANTASTIC','["fan","tas","tic"]'),
  ('BASKETBALL','["bas","ket","ball"]'), ('WATERMELON','["wa","ter","mel","on"]'),
  ('PHOTOGRAPH','["pho","to","graph"]'), ('TELEVISION','["tel","e","vi","sion"]'),
  ('LABORATORY','["la","bor","a","to","ry"]'), ('GYMNASTICS','["gym","nas","tics"]'),
  ('PEPPERMINT','["pep","per","mint"]'), ('STRAWBERRY','["straw","ber","ry"]'),
  ('DICTIONARY','["dic","tion","ar","y"]')
ON CONFLICT (word) DO NOTHING;
