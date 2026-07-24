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
  position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 9),
  text        TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, position)
);
CREATE INDEX IF NOT EXISTS omw_reply_phrases_account_idx ON omw_reply_phrases (account_id);

-- Relax the position range on any DB that created this table with a lower cap,
-- so up to 9 slots are allowed. Idempotent.
ALTER TABLE omw_reply_phrases DROP CONSTRAINT IF EXISTS omw_reply_phrases_position_check;
ALTER TABLE omw_reply_phrases ADD  CONSTRAINT omw_reply_phrases_position_check CHECK (position BETWEEN 1 AND 9);

-- `text` is the short PILL LABEL the sender taps (e.g. "cuddle me"). `sent_template`
-- is the line broadcast to both banners, with variables filled from the SENDER:
--   {name} → sender's first name,  {obj} → her/him/them,
--   {subj} → she's/he's/they're,   {poss} → her/his/their.
-- e.g. "{name} wants you to cuddle {obj}" → "Katie wants you to cuddle her".
-- Blank template → the pill label is sent as-is.
ALTER TABLE omw_reply_phrases ADD COLUMN IF NOT EXISTS sent_template TEXT;
