-- Persists in-progress Dirty Wordle guesses per account per day.
-- Allows players to resume from any device/browser mid-game.

CREATE TABLE IF NOT EXISTS dirty_wordle_progress (
  account_id  INTEGER     NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  guesses     JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, date)
);
