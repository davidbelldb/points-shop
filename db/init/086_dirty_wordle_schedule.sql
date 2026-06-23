-- Dirty Wordle daily word schedule
-- Maps each calendar date to the word served that day.
-- Words are assigned on-demand (first request of the day) from a shuffled cycle
-- that exhausts the full word list before repeating any word.

CREATE TABLE IF NOT EXISTS dirty_wordle_schedule (
  date  DATE PRIMARY KEY,
  word  TEXT NOT NULL,
  cycle INT  NOT NULL DEFAULT 1   -- which pass through the word list this belongs to
);
