-- Scrolls: a dedicated raven-message entity layered on top of chat.
-- A scroll is sent from an origin to a destination; the great-circle distance
-- between them (scaled by an admin-tunable speed multiplier) determines how
-- long the crow takes to arrive. The recipient only "receives" the scroll once
-- deliver_at has passed. The scroll is stamped with its in-world sent time/date
-- like a real medieval raven message.
--
-- Deliberately NOT folded into chat_messages: scrolls have their own list,
-- their own in-flight/delivered lifecycle, their own arrival notification, and
-- their own read state.

CREATE TABLE IF NOT EXISTS scrolls (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  body          TEXT        NOT NULL,

  -- Origin / destination for the flight-time simulation. Coordinates are the
  -- source of truth for distance; labels are for display ("from Winterfell").
  origin_label  TEXT,
  origin_lat    DOUBLE PRECISION,
  origin_lng    DOUBLE PRECISION,
  dest_label    TEXT,
  dest_lat      DOUBLE PRECISION,
  dest_lng      DOUBLE PRECISION,

  -- Computed flight figures (stored so display + delivery stay consistent even
  -- if config changes later).
  distance_km     DOUBLE PRECISION NOT NULL DEFAULT 0,
  flight_seconds  INTEGER          NOT NULL DEFAULT 0,  -- real-world delay applied

  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- in-world stamp shown on the scroll
  deliver_at    TIMESTAMPTZ NOT NULL,                   -- sent_at + flight_seconds
  delivered     BOOLEAN     NOT NULL DEFAULT FALSE,
  delivered_at  TIMESTAMPTZ,                            -- when arrival actually fired
  read_at       TIMESTAMPTZ,

  -- 'in_flight' until deliver_at passes, then 'delivered'.
  status        TEXT        NOT NULL DEFAULT 'in_flight'
                  CHECK (status IN ('in_flight', 'delivered')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recipient inbox lookups (newest first) and arrival scans.
CREATE INDEX IF NOT EXISTS idx_scrolls_recipient   ON scrolls(recipient_id, deliver_at DESC);
-- Fast scan for scrolls that are due to arrive but not yet flipped to delivered.
CREATE INDEX IF NOT EXISTS idx_scrolls_due         ON scrolls(deliver_at) WHERE delivered = FALSE;
-- Sender's outbox.
CREATE INDEX IF NOT EXISTS idx_scrolls_sender       ON scrolls(sender_id, sent_at DESC);
