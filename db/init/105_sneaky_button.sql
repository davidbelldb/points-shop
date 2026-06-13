-- "Sneaky Button" — admin-configurable homepage button that fetches a random
-- cute cat/dog picture or gif (via TheCatAPI / TheDogAPI). Same
-- homepage_visible / homepage_days pattern as stb15_config and wheels.

CREATE TABLE IF NOT EXISTS sneaky_button_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  homepage_visible BOOLEAN NOT NULL DEFAULT FALSE,
  homepage_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::INTEGER[],
  animal_type TEXT NOT NULL DEFAULT 'cat' CHECK (animal_type IN ('cat', 'dog', 'random')),
  button_label TEXT NOT NULL DEFAULT '🐾 Sneaky Button',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO sneaky_button_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
