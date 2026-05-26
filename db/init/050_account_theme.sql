-- Per-account theme preference (light / dark).
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'light';
