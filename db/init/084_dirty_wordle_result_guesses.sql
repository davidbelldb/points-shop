-- Store the actual guess words on completed Dirty Wordle games
-- so the board can be restored on any device even after progress is cleared.
ALTER TABLE dirty_wordle_results
  ADD COLUMN IF NOT EXISTS guesses JSONB NOT NULL DEFAULT '[]';
