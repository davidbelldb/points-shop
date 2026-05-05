ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_role_check') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_role_check CHECK (role IN ('customer', 'admin'));
  END IF;
END $$;

UPDATE accounts SET username = 'katie', role = 'customer'
  WHERE id = '00000000-0000-0000-0000-000000000001' AND username IS NULL;

INSERT INTO accounts (id, username, role, name, email, points_balance)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'david',
  'admin',
  'David',
  'davidbell.db@googlemail.com',
  0
)
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username
  ON accounts(LOWER(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token                     TEXT NOT NULL UNIQUE,
  impersonating_account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  last_used_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
