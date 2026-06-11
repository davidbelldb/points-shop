-- Shopping trips — group list items per trip ("Saturday big shop", etc.).
-- Items with trip_id NULL live on the General list; deleting a trip moves
-- its items back to General rather than losing them.
CREATE TABLE IF NOT EXISTS shopping_trips (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS trip_id INTEGER REFERENCES shopping_trips(id) ON DELETE SET NULL;
