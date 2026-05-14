-- Five sets of scattered tile letters that the game picks from at random on page load.
-- Each set has a "back" (above the box, 8 tiles) and "front" (below the box, 7 tiles) plus
-- an `active` flag — only active sets are eligible for random selection.

CREATE TABLE IF NOT EXISTS stb_scattered_sets (
  ord INT PRIMARY KEY CHECK (ord BETWEEN 1 AND 5),
  back TEXT NOT NULL DEFAULT '________',
  front TEXT NOT NULL DEFAULT '_______',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed slot 1 from the existing legacy single-set columns, with active=true.
DO $$
DECLARE
  legacy_back  TEXT;
  legacy_front TEXT;
BEGIN
  SELECT scattered_letters_back, scattered_letters_front
    INTO legacy_back, legacy_front
    FROM stb_config WHERE id = 1;

  INSERT INTO stb_scattered_sets (ord, back, front, active) VALUES
    (1, COALESCE(legacy_back, '________'), COALESCE(LEFT(legacy_front, 7), '_______'), TRUE)
  ON CONFLICT (ord) DO NOTHING;
END $$;

-- Seed slots 2..5 empty + inactive.
INSERT INTO stb_scattered_sets (ord, active)
VALUES (2, FALSE), (3, FALSE), (4, FALSE), (5, FALSE)
ON CONFLICT (ord) DO NOTHING;
