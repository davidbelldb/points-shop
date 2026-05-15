-- Four dice palettes (body + pip colour pairs). On each throw, each die picks one at
-- random from the active palettes — so dice 1 and dice 2 can come up different colours
-- in the same round, and the palette changes per throw.

CREATE TABLE IF NOT EXISTS stb_dice_palettes (
  ord INT PRIMARY KEY CHECK (ord BETWEEN 1 AND 4),
  body TEXT NOT NULL DEFAULT '#e773b0',
  pip TEXT NOT NULL DEFAULT '#000000',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed slot 1 from the existing legacy single-colour columns and mark it active.
DO $$
DECLARE
  legacy_body TEXT;
  legacy_pip  TEXT;
BEGIN
  SELECT dice_colour, pip_colour INTO legacy_body, legacy_pip FROM stb_config WHERE id = 1;
  INSERT INTO stb_dice_palettes (ord, body, pip, active) VALUES
    (1, COALESCE(legacy_body, '#e773b0'), COALESCE(legacy_pip, '#000000'), TRUE)
  ON CONFLICT (ord) DO NOTHING;
END $$;

-- Slots 2..4 inactive by default.
INSERT INTO stb_dice_palettes (ord, body, pip, active) VALUES
  (2, '#e773b0', '#000000', FALSE),
  (3, '#e773b0', '#000000', FALSE),
  (4, '#e773b0', '#000000', FALSE)
ON CONFLICT (ord) DO NOTHING;
