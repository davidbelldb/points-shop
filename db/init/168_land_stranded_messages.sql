-- ---------------------------------------------------------------------------
-- Land every message still in the air.
--
-- The crow flight was meant to be opt-in: the native app sends `crows: true`
-- and draws the journey. But the flag was read on the route (for the location
-- check) and never passed to sendMessage, so EVERY message got a flight —
-- including the web app's, which has no crow bubble, no tracker, and queries
-- that filter on `deliver_at <= NOW()`. A message sent there simply disappeared
-- from its own thread until the bird arrived.
--
-- The code fix gates the flight on the sending client. This lands whatever is
-- already airborne, because there is no column recording which app sent a
-- message — both clients write identical rows. A genuinely in-flight native
-- message therefore arrives early, once, which is the cheaper mistake.
--
-- Matches the shape the instant path already writes (deliver_at set, not null),
-- so nothing downstream meets a case it hasn't seen.
-- ---------------------------------------------------------------------------

UPDATE chat_messages
   SET deliver_at     = created_at,
       flight_seconds = 0
 WHERE deliver_at IS NOT NULL
   AND deliver_at > NOW();

-- Any Live Activity for one of those is now narrating a journey that has
-- ended. The resolver ends an activity once deliver_at has passed, so leaving
-- la_ended alone lets it send a proper landing rather than going quiet.

-- Re-running is safe: nothing is left with a future deliver_at to match.
