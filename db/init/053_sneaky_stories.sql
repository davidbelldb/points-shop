-- Instagram-style 24-hour disappearing stories that auto-archive into the
-- Sneaky Calendar's Highlights. We keep a single table for both states
-- (active and archived) and use `expires_at` to discriminate; nothing
-- physically moves at the 24-hour mark.
--
-- `media_url` is the uploaded file URL (jpeg/png/webp/mp4/webm/quicktime via
-- /api/admin/upload). `media_type` is normalised to 'image' or 'video' so the
-- client doesn't have to sniff mimetypes.
CREATE TABLE IF NOT EXISTS sneaky_stories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    media_url    TEXT NOT NULL,
    media_type   TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
    caption      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_sneaky_stories_active  ON sneaky_stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_sneaky_stories_author  ON sneaky_stories (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sneaky_stories_created ON sneaky_stories (created_at DESC);

-- Link chat replies back to the story that prompted them. UI uses this to
-- render a small thumbnail + caption above the message bubble. SET NULL on
-- delete so chat history survives if a story row is ever removed manually.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_story_id UUID
    REFERENCES sneaky_stories(id) ON DELETE SET NULL;
