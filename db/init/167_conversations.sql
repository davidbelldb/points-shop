-- ---------------------------------------------------------------------------
-- Conversations: messaging beyond two people.
--
-- chat_messages has a single recipient_id, which is a two-person assumption
-- baked into the schema. This adds a conversation each message belongs to, and
-- a membership list, so a thread can have three people in it — or thirty.
--
-- THE CAPACITOR APP MUST KEEP WORKING. So:
--   * every existing message gets a 'direct' conversation, and keeps its
--     recipient_id exactly as it is
--   * a direct message still populates recipient_id, so the web client's
--     queries are untouched
--   * a GROUP message leaves recipient_id NULL, which means the web client
--     simply never sees it — groups are a native-app feature until cutover
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT        NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group')),
  -- Groups are named; a direct thread is named by whoever you're talking to.
  title      TEXT,
  photo_url  TEXT,
  created_by UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Group unread is a watermark rather than a flag per message per person.
  last_read_at    TIMESTAMPTZ,
  left_at         TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, account_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_account
    ON conversation_members (account_id) WHERE left_at IS NULL;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS chat_messages_conversation
    ON chat_messages (conversation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Per-recipient delivery.
--
-- A crow flies to a person, not to a thread: in a group, the member three
-- streets away gets it before the one across town. Direct messages keep their
-- deliver_at on the message row as well, so nothing that reads it breaks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_deliveries (
  message_id     UUID        NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  account_id     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  flight_seconds INTEGER     NOT NULL DEFAULT 0,
  deliver_at     TIMESTAMPTZ NOT NULL,
  read_at        TIMESTAMPTZ,
  origin_label   TEXT,
  dest_label     TEXT,
  origin_lat     DOUBLE PRECISION,
  origin_lng     DOUBLE PRECISION,
  dest_lat       DOUBLE PRECISION,
  dest_lng       DOUBLE PRECISION,
  route_streets  JSONB,
  la_channel_id  TEXT,
  la_phase       SMALLINT    NOT NULL DEFAULT 0,
  la_ended       BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (message_id, account_id)
);

CREATE INDEX IF NOT EXISTS message_deliveries_inbox
    ON message_deliveries (account_id, deliver_at DESC);
CREATE INDEX IF NOT EXISTS message_deliveries_pending
    ON message_deliveries (deliver_at) WHERE la_ended = FALSE AND la_channel_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill: one direct conversation per pair that has ever spoken.
-- ---------------------------------------------------------------------------
WITH pairs AS (
  SELECT DISTINCT LEAST(sender_id, recipient_id) AS a, GREATEST(sender_id, recipient_id) AS b
    FROM chat_messages
   WHERE recipient_id IS NOT NULL
), made AS (
  INSERT INTO conversations (kind, created_at)
  SELECT 'direct', NOW() FROM pairs
  RETURNING id
), numbered AS (
  SELECT id, ROW_NUMBER() OVER () AS rn FROM made
), pairs_numbered AS (
  SELECT a, b, ROW_NUMBER() OVER () AS rn FROM pairs
)
INSERT INTO conversation_members (conversation_id, account_id)
SELECT n.id, p.a FROM numbered n JOIN pairs_numbered p ON p.rn = n.rn
UNION ALL
SELECT n.id, p.b FROM numbered n JOIN pairs_numbered p ON p.rn = n.rn
ON CONFLICT DO NOTHING;

-- Point every existing message at its pair's conversation.
UPDATE chat_messages m
   SET conversation_id = c.id
  FROM conversations c
 WHERE m.conversation_id IS NULL
   AND m.recipient_id IS NOT NULL
   AND c.kind = 'direct'
   AND (SELECT COUNT(*) FROM conversation_members cm
         WHERE cm.conversation_id = c.id
           AND cm.account_id IN (m.sender_id, m.recipient_id)) = 2;

-- And give every already-delivered message a delivery row for its recipient.
INSERT INTO message_deliveries (
  message_id, account_id, flight_seconds, deliver_at, read_at,
  origin_label, dest_label, origin_lat, origin_lng, dest_lat, dest_lng, route_streets)
SELECT id, recipient_id, COALESCE(flight_seconds, 0), COALESCE(deliver_at, created_at), read_at,
       origin_label, dest_label, origin_lat, origin_lng, dest_lat, dest_lng, route_streets
  FROM chat_messages
 WHERE recipient_id IS NOT NULL
ON CONFLICT DO NOTHING;
