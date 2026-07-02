-- Series 2: July 2026
INSERT INTO dirty_wordle_series (name, starts_on, ends_on)
VALUES ('Series 2', '2026-07-01', '2026-07-31')
ON CONFLICT DO NOTHING;
