-- In-line message replies (WhatsApp-style swipe-right). Self-referencing
-- FK from chat_messages.reply_to_message_id back to chat_messages.id. SET
-- NULL on delete so a reply survives the original being removed (the UI
-- just shows the message without its quote preview if the target's gone).
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply
  ON chat_messages (reply_to_message_id);
