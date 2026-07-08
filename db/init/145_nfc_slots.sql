-- Reusable NFC tag "slots". Each physical tag is written ONCE with a stable
-- slug URL (https://sneakypoints.com/t/<slug>). The slot points at a story,
-- and which story it points at can be reassigned remotely from admin — so the
-- tag never needs rewriting. story_id nulls out if the target story is deleted.
CREATE TABLE IF NOT EXISTS nfc_slots (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  label      TEXT NOT NULL,
  story_id   UUID REFERENCES sneaky_stories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
