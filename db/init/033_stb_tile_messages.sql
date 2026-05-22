-- Up to 10 nine-character messages for the reverse of the in-box number tiles.
-- The game picks one at random from the active messages each time a new game starts.

CREATE TABLE IF NOT EXISTS stb_tile_messages (
  ord INT PRIMARY KEY CHECK (ord BETWEEN 1 AND 10),
  message TEXT NOT NULL DEFAULT '_________',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed slot 1 from the existing single hidden_message and mark it active.
DO $$
DECLARE
  legacy TEXT;
BEGIN
  SELECT hidden_message INTO legacy FROM stb_config WHERE id = 1;
  INSERT INTO stb_tile_messages (ord, message, active) VALUES
    (1, COALESCE(NULLIF(legacy, ''), 'I_MISS_U!'), TRUE)
  ON CONFLICT (ord) DO NOTHING;
END $$;

-- Slots 2..10 inactive, blank.
INSERT INTO stb_tile_messages (ord, message, active)
SELECT g, '_________', FALSE FROM generate_series(2, 10) AS g
ON CONFLICT (ord) DO NOTHING;
