-- ---------------------------------------------------------------------------
-- Messages travel by crow, and a crow has to fly the distance.
--
-- Everything in the native Messages thread arrives by crow, so a message needs
-- the same two facts a scroll has: how long its journey takes, and when it
-- lands. Distance comes from where the two people say they are.
--
-- The delay is enforced for clients that ask for it (the native app, which
-- draws the journey). The web client reads the thread as it always has, so
-- nothing changes for anyone still on the Capacitor app.
-- ---------------------------------------------------------------------------

-- Where someone is sending from. Deliberately on the account rather than per
-- message: you set it once and it holds until you move.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS location_lat    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_label  TEXT,
  ADD COLUMN IF NOT EXISTS location_set_at TIMESTAMPTZ;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS flight_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS deliver_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS origin_label   TEXT,
  ADD COLUMN IF NOT EXISTS dest_label     TEXT,
  ADD COLUMN IF NOT EXISTS distance_km    DOUBLE PRECISION;

-- Everything already said has already arrived.
UPDATE chat_messages
   SET deliver_at = created_at, flight_seconds = 0
 WHERE deliver_at IS NULL;

-- The recipient's side of the thread is read by deliver_at, so it wants an index.
CREATE INDEX IF NOT EXISTS chat_messages_deliver
    ON chat_messages (recipient_id, deliver_at);
