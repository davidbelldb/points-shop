-- Scheduled push notifications: sent at a future time by the backend poller.
CREATE TABLE IF NOT EXISTS scheduled_push_notifications (
  id             SERIAL      PRIMARY KEY,
  title          TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  url            TEXT        NOT NULL DEFAULT '/',
  account_id     TEXT,                          -- NULL = send to everyone
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add account_id if upgrading from the initial version of this migration
ALTER TABLE scheduled_push_notifications
  ADD COLUMN IF NOT EXISTS account_id TEXT;

CREATE INDEX IF NOT EXISTS idx_scheduled_push_due
  ON scheduled_push_notifications (scheduled_for)
  WHERE sent_at IS NULL;
