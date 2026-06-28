-- Dirty Talk — admin-tunable scoring strictness.
-- Azure's en-GB grading is top-heavy (sloppy attempts still hit 95–100). The
-- client stretches [score_floor,100] → [0,100], so a higher floor = stricter.
-- 0 = no stretch (raw Azure score). Tune live without a rebuild.
ALTER TABLE jstw_config
  ADD COLUMN IF NOT EXISTS score_floor INTEGER NOT NULL DEFAULT 0;

-- Per-word countdown length (seconds) — say it before it hits zero.
ALTER TABLE jstw_config
  ADD COLUMN IF NOT EXISTS countdown_seconds INTEGER NOT NULL DEFAULT 4;
