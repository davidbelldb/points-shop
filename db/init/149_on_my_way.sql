-- ===========================================================================
-- "On My Way" (OMW) — a Live Activity that tracks a traveller's live progress
-- toward a fixed destination (David → Blinco Grove, Katie → Bishops Court).
--
-- Reuses the crow Live Activity plumbing conceptually but is a SEPARATE
-- ActivityKit type (OmwActivityAttributes) so it can't regress scrolls. v1 is
-- an admin-only self-test: a trip loops back to the traveller's own device.
-- ===========================================================================

-- Each user's up to 3 "quick destinations" (position 1–3), self-managed on the
-- /account page (Katie has no admin). Position 1 is the default the quick action
-- fires. The trip always starts from the traveller's live location; the route +
-- ETA are computed then, so no origin is stored here. Location search is bounded
-- to Cambridge in the UI.
CREATE TABLE IF NOT EXISTS omw_quick_destinations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  label       TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, position)
);
CREATE INDEX IF NOT EXISTS omw_quickdest_account_idx ON omw_quick_destinations (account_id);

-- Optional friendly display name. `label` is the place/street name from the
-- Cambridge search; `alias` (e.g. "Katie's", "Home", "The Office") overrides what
-- shows in the app + Live Activity. NULL/blank → fall back to `label`.
ALTER TABLE omw_quick_destinations ADD COLUMN IF NOT EXISTS alias TEXT;

-- "Current transport" is a single per-user setting (what you're travelling by),
-- not per destination. Every triggered journey uses it. bicycle | scooter | uber.
-- Katie only ever takes an Uber, so default her to it.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS omw_transport TEXT NOT NULL DEFAULT 'bicycle';
UPDATE accounts SET omw_transport = 'uber' WHERE username = 'katie' AND omw_transport = 'bicycle';

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
  traveller_pronoun TEXT NOT NULL DEFAULT 'they',  -- he | she | they — for the narration copy

  origin_lat       DOUBLE PRECISION,
  origin_lng       DOUBLE PRECISION,
  dest_label       TEXT,
  dest_lat         DOUBLE PRECISION,
  dest_lng         DOUBLE PRECISION,
  transport        TEXT NOT NULL DEFAULT 'bicycle',

  current_lat      DOUBLE PRECISION,
  current_lng      DOUBLE PRECISION,
  route_points     JSONB,   -- plotted [[lat,lng],…] polyline; progress projects onto it

  distance_total_km     DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_remaining_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  eta_seconds      INTEGER NOT NULL DEFAULT 0,            -- estimated ride time; paces the bar + nodes
  progress         DOUBLE PRECISION NOT NULL DEFAULT 0,   -- 0..1 (time-driven)
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

-- Self-heal: if an earlier version of this migration created omw_trips without
-- these later columns, CREATE TABLE IF NOT EXISTS above won't add them. These
-- make re-running safe regardless of prior state.
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS traveller_pronoun TEXT NOT NULL DEFAULT 'they';
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS transport         TEXT NOT NULL DEFAULT 'bicycle';
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS route_points      JSONB;
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS eta_seconds       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS current_lat       DOUBLE PRECISION;
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS current_lng       DOUBLE PRECISION;
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS la_channel_id     TEXT;
-- Distance already covered before the current (possibly re-routed) polyline, so
-- progress survives a mid-journey reroute: progress = (offset + along) / total.
ALTER TABLE omw_trips ADD COLUMN IF NOT EXISTS route_offset_km   DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Single-row feature config. `live_to_partner` = false → a trip loops back to
-- the traveller (v1 self-test). Flip it true to go two-way: a trip is pushed to
-- the OTHER user's device instead (David → Katie, Katie → David).
CREATE TABLE IF NOT EXISTS omw_config (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  live_to_partner BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO omw_config (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

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

-- Seed David's first quick destination (Blinco Grove) so there's something to
-- fire on day one. Idempotent. Users add/edit their three on /account.
--   Blinco Grove, Cambridge (52°11'09.6"N 0°08'31.8"E) = 52.186000, 0.142167
INSERT INTO omw_quick_destinations (account_id, position, label, lat, lng)
SELECT id, 1, 'Blinco Grove', 52.186000, 0.142167 FROM accounts WHERE role = 'admin'
ON CONFLICT (account_id, position) DO NOTHING;

--   Bishops Court, Cambridge (52°10'00.5"N 0°06'32.9"E) = 52.166806, 0.109139
INSERT INTO omw_quick_destinations (account_id, position, label, lat, lng)
SELECT id, 1, 'Bishops Court', 52.166806, 0.109139 FROM accounts WHERE username = 'katie'
ON CONFLICT (account_id, position) DO NOTHING;

--   David slot 2 — Shaftesbury Road (52°11'12.7"N 0°07'55.7"E) = 52.186861, 0.132139
INSERT INTO omw_quick_destinations (account_id, position, label, lat, lng)
SELECT id, 2, 'Shaftesbury Road', 52.186861, 0.132139 FROM accounts WHERE role = 'admin'
ON CONFLICT (account_id, position) DO NOTHING;

-- Pronoun drives the narration copy ("he's" / "she's" / "they're"). Default is
-- neutral; David and Katie get theirs so the feature reads right in both
-- directions when we go two-way.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS pronoun TEXT NOT NULL DEFAULT 'they';
UPDATE accounts SET pronoun = 'he'  WHERE username = 'david' AND pronoun = 'they';
UPDATE accounts SET pronoun = 'she' WHERE username = 'katie' AND pronoun = 'they';
