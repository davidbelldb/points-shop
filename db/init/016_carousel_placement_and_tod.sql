ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'top';
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS link_url  TEXT;

INSERT INTO settings (key, value) VALUES
  ('games_title',    'Games'),
  ('games_subtitle', 'Pick your poison.')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS truth_or_dare_prompts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        TEXT NOT NULL CHECK (type IN ('truth', 'dare')),
    text        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tod_active ON truth_or_dare_prompts (type, is_active);
