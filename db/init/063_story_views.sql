-- Per-(story, viewer) record so the author can see who has seen their
-- story, and so the home strip can dim already-viewed stories on the
-- recipient's side.
-- Composite primary key prevents double-counting — the recorder uses
-- ON CONFLICT DO NOTHING so re-opening a story doesn't bump viewed_at.
CREATE TABLE IF NOT EXISTS story_views (
    story_id  UUID NOT NULL REFERENCES sneaky_stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES accounts(id)        ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (story_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_story_views_story  ON story_views (story_id);
