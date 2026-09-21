-- ---------------------------------------------------------------------------
-- Friendships: who may message whom.
--
-- Messaging began as a two-person app, where "the other user" was the whole
-- model. With three accounts — one of them a child's — being reachable has to
-- be something people opt into, not a side effect of having an account.
--
-- One row per PAIR rather than per direction, with the lower uuid always in
-- account_a, so the unique index catches the same request sent the other way
-- round.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS friendships (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_a     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_b     UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Who asked. The OTHER one is the only account that may answer.
  requested_by  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  --   pending            – waiting on the addressee
  --   awaiting_approval  – addressee said yes, but a kids account is involved
  --                        so an admin has to agree as well
  --   accepted           – they can message each other
  --   declined           – said no; the pair can ask again later
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'awaiting_approval', 'accepted', 'declined')),

  approved_by   UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,

  CONSTRAINT friendship_pair_ordered CHECK (account_a < account_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair ON friendships (account_a, account_b);
CREATE INDEX IF NOT EXISTS friendships_a ON friendships (account_a) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS friendships_b ON friendships (account_b) WHERE status = 'accepted';

-- ---------------------------------------------------------------------------
-- Backfill: everyone who already has an account is already connected.
--
-- Today every account can message every other one, so accepting every existing
-- pair keeps behaviour identical on deploy — nobody loses a conversation. From
-- here on, a NEW account starts connected to nobody and has to ask.
-- ---------------------------------------------------------------------------
INSERT INTO friendships (account_a, account_b, requested_by, status, responded_at)
SELECT a.id, b.id, a.id, 'accepted', NOW()
  FROM accounts a
  JOIN accounts b ON a.id < b.id
ON CONFLICT (account_a, account_b) DO NOTHING;
