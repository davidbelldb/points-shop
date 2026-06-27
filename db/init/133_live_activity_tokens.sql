-- ActivityKit Live Activity push tokens.
--   kind = 'pts'    : push-to-start token (per device/account) — lets the server
--                     START a crow Live Activity while the app is closed.
--   kind = 'update' : per-activity update token (keyed by scroll_id) — lets the
--                     server UPDATE/END a running activity (arrival, subtitles).
CREATE TABLE IF NOT EXISTS live_activity_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('pts','update')),
  scroll_id  UUID REFERENCES scrolls(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS lat_account_kind_idx ON live_activity_tokens (account_id, kind);
CREATE INDEX IF NOT EXISTS lat_scroll_idx ON live_activity_tokens (scroll_id);
