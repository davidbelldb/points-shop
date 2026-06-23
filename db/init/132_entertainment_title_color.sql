-- Per-title wheel colour for the Wheel of Entertainment, mirroring the
-- per-segment colours on the Wheel of Misfortune. Safe to re-run.
ALTER TABLE entertainment_titles
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#14b8a6';
