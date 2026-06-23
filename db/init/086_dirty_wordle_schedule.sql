-- Dirty Wordle daily word schedule
-- Maps each calendar date to the word served that day.
-- Words are assigned on-demand (first request of the day) from a shuffled cycle
-- that exhausts the full word list before repeating any word.

CREATE TABLE IF NOT EXISTS dirty_wordle_schedule (
  date  DATE PRIMARY KEY,
  word  TEXT NOT NULL,
  cycle INT  NOT NULL DEFAULT 1   -- which pass through the word list this belongs to
);

-- Pre-seed today so the transition from the old epoch formula is seamless.
-- COCKY is the word the client-side formula produced for 2026-06-23.
INSERT INTO dirty_wordle_schedule (date, word, cycle)
VALUES ('2026-06-23', 'COCKY', 1)
ON CONFLICT (date) DO NOTHING;
