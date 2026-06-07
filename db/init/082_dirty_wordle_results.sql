-- Stores each player's daily Dirty Wordle result so we can show
-- a head-to-head leaderboard with colour grids.
CREATE TABLE IF NOT EXISTS dirty_wordle_results (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date          DATE        NOT NULL,
  won           BOOLEAN     NOT NULL,
  guesses_taken INT         NOT NULL CHECK (guesses_taken BETWEEN 1 AND 6),
  guess_grid    JSONB       NOT NULL,   -- array of arrays: [['correct','absent',...],...]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, date)
);

CREATE INDEX IF NOT EXISTS dirty_wordle_results_date_idx ON dirty_wordle_results (date);
