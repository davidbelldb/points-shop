-- Per-message slider response payload. Set when the chat message was sent
-- as a reaction to a story's slider sticker. Shape (client-owned):
--   { "sticker_index": int, "value": 0..100, "emoji": "😎" | null }
-- The chat preview reads this + the story's sticker config to render the
-- slider at the exact spot the recipient chose.
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS slider_response JSONB;
