-- Three table-surface colours that the game picks from at random on page load.
-- Each slot has its own active flag — only active ones are in the random pool.

CREATE TABLE IF NOT EXISTS stb_table_colours (
  ord INT PRIMARY KEY CHECK (ord BETWEEN 1 AND 3),
  colour TEXT NOT NULL DEFAULT '#d3f3ea',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed slot 1 from the existing single table_colour and mark it active.
DO $$
DECLARE
  legacy TEXT;
BEGIN
  SELECT table_colour INTO legacy FROM stb_config WHERE id = 1;
  INSERT INTO stb_table_colours (ord, colour, active) VALUES
    (1, COALESCE(legacy, '#d3f3ea'), TRUE)
  ON CONFLICT (ord) DO NOTHING;
END $$;

-- Slots 2 and 3 inactive by default.
INSERT INTO stb_table_colours (ord, colour, active) VALUES
  (2, '#d3f3ea', FALSE),
  (3, '#d3f3ea', FALSE)
ON CONFLICT (ord) DO NOTHING;
