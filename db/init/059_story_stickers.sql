-- Story canvas stickers (slider, plain text later, etc.). Stored as a
-- JSONB array of objects; the client owns the shape and the backend just
-- validates the array-of-objects contract. Default empty array so existing
-- rows don't need a backfill.
ALTER TABLE sneaky_stories
  ADD COLUMN IF NOT EXISTS stickers JSONB NOT NULL DEFAULT '[]'::jsonb;
