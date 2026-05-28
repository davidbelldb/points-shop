-- Story length (in seconds) for image / audio stories. Null = use the
-- client's default (5s for an image, the natural duration for video/audio).
-- Allow 'audio' as a media_type so voice notes can ride the same plumbing
-- as photos and videos.
ALTER TABLE sneaky_stories
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

ALTER TABLE sneaky_stories
  DROP CONSTRAINT IF EXISTS sneaky_stories_media_type_check;

ALTER TABLE sneaky_stories
  ADD CONSTRAINT sneaky_stories_media_type_check
    CHECK (media_type IN ('image', 'video', 'audio'));
