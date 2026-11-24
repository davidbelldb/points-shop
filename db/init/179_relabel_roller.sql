-- ---------------------------------------------------------------------------
-- Relabel already-sent forecast scrolls from the old "Three-Eyed Crow" name to
-- "Indian Roller". The reader shows the stored from_label, so existing perched
-- forecasts keep the old name until this runs. (New forecasts already use it.)
-- ---------------------------------------------------------------------------
UPDATE scrolls
   SET from_label = 'the Indian Roller'
 WHERE from_label = 'the Three-Eyed Crow';
