-- ===========================================================================
-- "On My Way" — preset REPLY PHRASES.
--
-- Each user has up to 5 short phrases they can tap to send during a live OMW
-- journey (e.g. "Put the kettle on", "Hurry up!"). Tapping one flashes it in the
-- Live Activity subtitle on BOTH devices for ~20s, then the route narration
-- resumes. Phrases are per-user and managed by the admin (David sets both).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS omw_reply_phrases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
  text        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, position)
);
CREATE INDEX IF NOT EXISTS omw_reply_phrases_account_idx ON omw_reply_phrases (account_id);
