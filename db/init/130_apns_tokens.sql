-- Native iOS push (APNs): one row per device that registered a push token.
-- Mirrors push_subscriptions (web push) but for the Capacitor iOS app, whose
-- tokens come from Apple's Push Notification service rather than the Web Push
-- VAPID endpoint.
CREATE TABLE IF NOT EXISTS apns_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS apns_tokens_account_idx ON apns_tokens (account_id);
