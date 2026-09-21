-- A message's crow gets a Live Activity like a scroll's, so it needs somewhere
-- to remember the broadcast channel that carries its updates.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS la_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS la_phase      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS la_ended      BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS chat_messages_la_pending
    ON chat_messages (deliver_at)
 WHERE la_ended = FALSE AND la_channel_id IS NOT NULL;
