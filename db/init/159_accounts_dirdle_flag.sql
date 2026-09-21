-- Add opt-in flag for Dirty Wordle leaderboard visibility.
-- Defaults to true so existing accounts are unaffected.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dirdle BOOLEAN NOT NULL DEFAULT TRUE;

-- Hide George from Dirdle leaderboards.
UPDATE accounts SET dirdle = FALSE WHERE name ILIKE 'george';
