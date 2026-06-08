-- Dirty Wordle Series: named competitions with explicit date ranges.
-- A series winner is whoever earns more dirty-wordle points in that window.
CREATE TABLE IF NOT EXISTS dirty_wordle_series (
  id         SERIAL PRIMARY KEY,
  name       TEXT   NOT NULL,
  starts_on  DATE   NOT NULL,
  ends_on    DATE   NOT NULL,
  UNIQUE (starts_on)
);

-- Series 1: kicked off 8 June 2026, runs through 30 June 2026.
INSERT INTO dirty_wordle_series (name, starts_on, ends_on)
VALUES ('Series 1', '2026-06-08', '2026-06-30')
ON CONFLICT DO NOTHING;
