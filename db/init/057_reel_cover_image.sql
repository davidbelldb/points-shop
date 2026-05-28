-- Custom cover image per reel — a photo uploaded specifically as the
-- reel's "thumbnail" on the strip circle, independent of the stories
-- inside the reel. Falls back through cover_story_id → latest added story
-- when null.
ALTER TABLE story_reels
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
