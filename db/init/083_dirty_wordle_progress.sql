-- Persists in-progress Dirty Wordle guesses per account per day.
-- Allows players to resume from any device/browser mid-game.

-- NOTE: accounts.id is UUID. (An earlier version of this file said INTEGER,
-- which is why the live table's account_id ended up mistyped; the leaderboard
-- query casts both sides to text to tolerate that. Fresh installs get UUID.)
CREATE TABLE IF NOT EXISTS dirty_wordle_progress (
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  guesses     JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, date)
);
