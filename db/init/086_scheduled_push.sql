-- Scheduled push notifications: sent at a future time by the backend poller.
CREATE TABLE IF NOT EXISTS scheduled_push_notifications (
  id             SERIAL      PRIMARY KEY,
  title          TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  url            TEXT        NOT NULL DEFAULT '/',
  scheduled_for  TIMESTAMPTZ NOT NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_push_due
  ON scheduled_push_notifications (scheduled_for)
  WHERE sent_at IS NULL;
