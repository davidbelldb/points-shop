-- Soft-hide a story from the live feed and the archive vault, while
-- keeping it (and its reel_stories rows) so it persists inside any
-- highlight reels it's been saved to. The trash icon in the viewer uses
-- this flag automatically when the story is in at least one reel.
ALTER TABLE sneaky_stories
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sneaky_stories_visibility
  ON sneaky_stories (hidden_at, expires_at);
