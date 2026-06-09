-- Sneaky Moments
CREATE TABLE IF NOT EXISTS moments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'personal' CHECK (type IN ('personal', 'shared')),
  location    TEXT        NOT NULL DEFAULT '',
  body        TEXT        NOT NULL DEFAULT '',
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moment_media (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id   UUID        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('image', 'voice')),
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moments_account    ON moments(account_id);
CREATE INDEX IF NOT EXISTS idx_moments_created    ON moments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moment_media_moment ON moment_media(moment_id);
