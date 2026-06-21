-- Test/simulation support for the scroll feature.
-- A "simulated" scroll is self-addressed (sender_id = recipient_id): it runs the
-- entire send -> flight-delay -> arrival -> landing -> list pipeline, but loops
-- back to the sender so the partner never receives it. Used by the /new-chat dev
-- harness so the feature can be tested privately. Flagged so these stay hidden
-- from the partner even once scrolls merge into the live /messages page.
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT FALSE;
