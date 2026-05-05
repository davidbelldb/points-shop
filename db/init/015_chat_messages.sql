CREATE TABLE IF NOT EXISTS chat_messages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    recipient_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    body          TEXT NOT NULL,
    read_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_recipient_unread
  ON chat_messages (recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_chat_pair
  ON chat_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);
