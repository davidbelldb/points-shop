-- ---------------------------------------------------------------------------
-- Remember which APNs environment a scroll's Live Activity channel lives on, so
-- later broadcast UPDATES (phase/street narration, landing) go to the matching
-- gateway. A Debug build is sandbox; without this, updates to a sandbox activity
-- are sent to production and silently dropped (the gliding bird never advances).
-- ---------------------------------------------------------------------------
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS la_sandbox BOOLEAN NOT NULL DEFAULT FALSE;
