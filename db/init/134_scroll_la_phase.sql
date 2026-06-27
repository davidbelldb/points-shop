-- Tracks the highest subtitle "phase" already pushed to a scroll's crow Live
-- Activity (0 = none, 1–3 = street narration, 4 = coming into land). The
-- resolver uses this to advance the subtitle exactly once per phase.
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS la_phase INTEGER NOT NULL DEFAULT 0;
