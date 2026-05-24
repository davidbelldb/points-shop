-- Ducky Derby Phase B: a duck can sink mid-race.
-- 50% chance per race that one non-winning duck goes under at sink_at progress (0-1).
ALTER TABLE ducky_races
  ADD COLUMN IF NOT EXISTS sink_ord INTEGER,
  ADD COLUMN IF NOT EXISTS sink_at  NUMERIC;
