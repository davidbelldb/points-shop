-- Series 3: August 2026
INSERT INTO dirty_wordle_series (name, starts_on, ends_on)
VALUES ('Series 3', '2026-08-01', '2026-08-31')
ON CONFLICT DO NOTHING;
