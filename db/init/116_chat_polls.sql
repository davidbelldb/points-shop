-- Poll votes for chat message polls.
-- The poll question + options are encoded in the message body as JSON.
CREATE TABLE IF NOT EXISTS chat_poll_votes (
  message_id  BIGINT      NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  account_id  BIGINT      NOT NULL REFERENCES accounts(id)      ON DELETE CASCADE,
  option_idx  SMALLINT    NOT NULL,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, account_id)
);
