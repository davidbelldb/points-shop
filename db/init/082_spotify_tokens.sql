-- Spotify OAuth token storage per account.
-- One row per account; upserted on each successful auth flow.
CREATE TABLE IF NOT EXISTS spotify_tokens (
  account_id    INTEGER     PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
