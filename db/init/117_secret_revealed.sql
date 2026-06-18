-- Track when a secret message has been revealed by the recipient
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS secret_revealed_at TIMESTAMPTZ;
