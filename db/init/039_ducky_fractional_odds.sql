-- Ducky Derby: switch odds from a decimal multiplier to fractional odds (e.g. 10/1, 5/2).

ALTER TABLE ducky_ducks ADD COLUMN IF NOT EXISTS odds_num INTEGER NOT NULL DEFAULT 3;
ALTER TABLE ducky_ducks ADD COLUMN IF NOT EXISTS odds_den INTEGER NOT NULL DEFAULT 1;

UPDATE ducky_ducks AS t SET odds_num = v.n, odds_den = v.d FROM (VALUES
  (1, 1, 1), (2, 5, 2), (3, 3, 1), (4, 7, 2), (5, 4, 1),
  (6, 5, 1), (7, 6, 1), (8, 8, 1), (9, 10, 1), (10, 15, 1)
) AS v(ord, n, d) WHERE t.ord = v.ord;

ALTER TABLE ducky_ducks DROP COLUMN IF EXISTS odds;
