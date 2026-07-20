-- ===========================================================================
-- "On My Way" (OMW) — a Live Activity that tracks a traveller's live progress
-- toward a fixed destination (David → Blinco Grove, Katie → Bishops Court).
--
-- Reuses the crow Live Activity plumbing conceptually but is a SEPARATE
-- ActivityKit type (OmwActivityAttributes) so it can't regress scrolls. v1 is
-- an admin-only self-test: a trip loops back to the traveller's own device.
-- ===========================================================================

-- Per-account target destination the OMW crow… er, cyclist, heads toward.
-- Set in /admin → "On My Way". One row per user; the traveller's own live
-- location is the origin, this is always the destination.
CREATE TABLE IF NOT EXISTS omw_destinations (
  account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One in-flight (or recently finished) OMW journey.
--   traveller_id : whose location is being tracked (the person on the move).
--   viewer_id    : whose device shows the Live Activity. For the v1 self-test
--                  this equals traveller_id (loops back to me).
--   *_lat/lng    : origin captured at trigger, destination copied from
--                  omw_destinations, and the latest reported position.
--   distance_*   : total route length (fixed at start) and remaining (updated
--                  on every location ping). progress = 1 - remaining/total.
--   phase        : highest of the 3 waypoint nodes passed (0–3; 4 = arrived).
--   la_channel_id: APNs broadcast channel so updates reach a closed app.
CREATE TABLE IF NOT EXISTS omw_trips (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traveller_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  viewer_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  simulated        BOOLEAN NOT NULL DEFAULT FALSE,

  origin_lat       DOUBLE PRECISION,
  origin_lng       DOUBLE PRECISION,
  dest_label       TEXT,
  dest_lat         DOUBLE PRECISION,
  dest_lng         DOUBLE PRECISION,

  current_lat      DOUBLE PRECISION,
  current_lng      DOUBLE PRECISION,

  distance_total_km     DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_remaining_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  progress         DOUBLE PRECISION NOT NULL DEFAULT 0,   -- 0..1
  phase            INTEGER NOT NULL DEFAULT 0,            -- highest node pushed

  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'arrived', 'cancelled')),
  la_channel_id    TEXT,

  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping_at     TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS omw_trips_traveller_active_idx
  ON omw_trips (traveller_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS omw_trips_viewer_idx ON omw_trips (viewer_id);

-- ActivityKit push tokens for the OMW activity type. Kept separate from
-- live_activity_tokens (which is scroll-scoped) so the two never collide:
--   kind = 'pts'    : push-to-start token per traveller device.
--   kind = 'update' : per-activity update token, keyed by trip_id.
CREATE TABLE IF NOT EXISTS omw_activity_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('pts', 'update')),
  trip_id    UUID REFERENCES omw_trips(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS omw_tok_account_kind_idx ON omw_activity_tokens (account_id, kind);
CREATE INDEX IF NOT EXISTS omw_tok_trip_idx ON omw_activity_tokens (trip_id);

-- Seed the two known destinations so /admin shows sensible defaults. Idempotent:
-- only fills a user's row if they don't already have one. Matches by username;
-- adjust in /admin if these coordinates need nudging.
--   Blinco Grove, Cambridge  ≈ 52.1893, 0.1387
--   Bishops Court (approx)   ≈ 52.2060, 0.1160  (tweak in admin)
INSERT INTO omw_destinations (account_id, label, lat, lng)
SELECT id, 'Blinco Grove', 52.1893, 0.1387 FROM accounts WHERE role = 'admin'
ON CONFLICT (account_id) DO NOTHING;
