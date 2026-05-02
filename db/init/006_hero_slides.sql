CREATE TABLE IF NOT EXISTS hero_slides (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url   TEXT NOT NULL,
    title       TEXT,
    subtitle    TEXT,
    code        TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
