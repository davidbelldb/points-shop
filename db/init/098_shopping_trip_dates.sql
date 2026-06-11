-- Shopping trips get a date — the list page renders trips as collapsible
-- date sections (TODAY / TOMORROW / "FRI 13 JUN").
ALTER TABLE shopping_trips
  ADD COLUMN IF NOT EXISTS trip_date DATE;

-- Reset the "your usuals" history — old entries came from the previous
-- product API and don't match the Waitrose-only catalogue.
TRUNCATE shopping_history;
