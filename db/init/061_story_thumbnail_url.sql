-- Per-story poster thumbnail URL (for video stories). Filled in
-- automatically by the upload pipeline (ffmpeg first-frame extract).
-- Existing video stories without a thumbnail are filled by a one-shot
-- backfill that runs on backend startup.
ALTER TABLE sneaky_stories
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
