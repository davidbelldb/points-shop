-- Private crossword puzzle (David only, at /cross-words). Single active puzzle:
-- an ordered list of words, each with a clue/hint and a direction. The grid
-- layout (intersections, black squares) is derived from the words at render
-- time, so we only persist the authored word list here.
CREATE TABLE IF NOT EXISTS crossword (
  id         INT PRIMARY KEY DEFAULT 1,
  title      TEXT  NOT NULL DEFAULT 'Crossword',
  words      JSONB NOT NULL DEFAULT '[]',   -- [{ word, hint, direction }]
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crossword_singleton CHECK (id = 1)
);

INSERT INTO crossword (id, title, words)
VALUES (1, 'Crossword', '[]')
ON CONFLICT (id) DO NOTHING;
