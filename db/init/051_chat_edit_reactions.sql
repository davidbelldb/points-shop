-- WhatsApp-style chat extras: edited timestamp + single-reaction-per-message.
-- `edited_at` is set when a sender re-saves their message body; the UI shows
-- "(edited)" beside the time if non-null. `reaction` is a free-text emoji
-- key (currently only 'heart' for the purple-heart double-tap), nullable.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reaction  TEXT;
