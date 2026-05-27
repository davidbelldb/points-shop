-- Instagram-style "Highlight Reels" — named collections of past stories
-- (e.g. "Childhood", "Yosemite"). A single story can sit in many reels.
--
-- cover_story_id is set to whichever story is currently used as the reel's
-- thumbnail circle. It SET NULLs if the cover story is later deleted, in
-- which case the UI falls back to the most recently added story.
CREATE TABLE IF NOT EXISTS story_reels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    cover_story_id  UUID REFERENCES sneaky_stories(id) ON DELETE SET NULL,
    created_by      UUID REFERENCES accounts(id)      ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Join table. CASCADE so deleting a story (or a reel) tidies up.
CREATE TABLE IF NOT EXISTS reel_stories (
    reel_id   UUID NOT NULL REFERENCES story_reels(id)    ON DELETE CASCADE,
    story_id  UUID NOT NULL REFERENCES sneaky_stories(id) ON DELETE CASCADE,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (reel_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_reel_stories_reel ON reel_stories (reel_id, added_at DESC);
