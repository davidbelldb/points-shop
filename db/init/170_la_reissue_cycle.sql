-- ---------------------------------------------------------------------------
-- Live Activity re-issue cycle.
--
-- iOS ends a Live Activity after ~8 hours, so a multi-day crow (e.g. the ~7.5-day
-- Cambridge → Chennai flight) would silently lose its lock-screen / Dynamic Island
-- card partway through. To keep exactly ONE live card for the whole journey, the
-- backend re-issues a fresh activity every 6 hours (see reissueStaleCrowActivities)
-- and dismisses the previous one.
--
-- la_cycle_started_at records when the CURRENT card was (re)issued. The scheduler
-- replaces any card older than 6h while the scroll is still in flight.
-- ---------------------------------------------------------------------------
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS la_cycle_started_at TIMESTAMPTZ;

-- Back-fill any in-flight scrolls that already have a live card so they enter the
-- re-issue cycle from now rather than being treated as 6h+ stale immediately.
UPDATE scrolls
   SET la_cycle_started_at = NOW()
 WHERE la_channel_id IS NOT NULL
   AND delivered = FALSE
   AND deliver_at > NOW()
   AND la_cycle_started_at IS NULL;
