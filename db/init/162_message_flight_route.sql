-- ---------------------------------------------------------------------------
-- The route a message's crow actually flew.
--
-- 161 stored how long the journey took and what the two ends were called. The
-- tracker needs the coordinates as well — and it needs the ones that applied
-- AT THE TIME, because people move. Reading the accounts' current locations
-- would redraw an old message's route from somewhere it never left.
-- ---------------------------------------------------------------------------
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lat   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dest_lng   DOUBLE PRECISION;
