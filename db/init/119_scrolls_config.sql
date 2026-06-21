-- Admin-tunable configuration for the scroll/crow feature.
-- Mirrors the wheel/STB pattern: behaviour + sprite layout live in the DB and
-- are edited from /admin (scrolls-config), so frames can be added or nudged
-- without a code change.

-- ---------------------------------------------------------------------------
-- Per-frame sprite layout for the two independent animation layers.
--   layer 'send' : sender's crow, fixed send-branch on the LEFT, flies
--                  low-left -> high-right and exits the right edge.
--   layer 'land' : recipient's crow, fixed landing-branch on the RIGHT, comes
--                  in high-right -> low-right and lands on the branch.
-- Coordinates are on a normalized 0..100 stage (responsive across desktop /
-- mobile PWA): x = 0 left edge .. 100 right edge, y = 0 top .. 100 bottom.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrolls_frames (
  layer        TEXT        NOT NULL CHECK (layer IN ('send', 'land')),
  frame_order  SMALLINT    NOT NULL,
  sprite_file  TEXT        NOT NULL,
  x            DOUBLE PRECISION NOT NULL DEFAULT 50,   -- 0..100 normalized
  y            DOUBLE PRECISION NOT NULL DEFAULT 50,   -- 0..100 normalized
  scale        DOUBLE PRECISION NOT NULL DEFAULT 1,
  rotation     DOUBLE PRECISION NOT NULL DEFAULT 0,    -- degrees
  opacity      DOUBLE PRECISION NOT NULL DEFAULT 1,
  duration_ms  INTEGER     NOT NULL DEFAULT 80,        -- per-frame override
  PRIMARY KEY (layer, frame_order)
);

-- ---------------------------------------------------------------------------
-- Global single-row settings (id is forced TRUE so there is only ever one row).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scrolls_settings (
  id                BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (id),

  -- Animation timing.
  frame_rate_fps    INTEGER     NOT NULL DEFAULT 12,   -- global default fps

  -- Flight-time simulation knobs.
  crow_speed_kmh    DOUBLE PRECISION NOT NULL DEFAULT 45,    -- a real raven, roughly
  -- Time compression: how many in-world seconds elapse per real second.
  -- 1     = authentically medieval (London->NY takes days)
  -- 60    = 1 raven-hour passes each real minute
  -- 99999 = effectively instant (handy for testing)
  speed_multiplier  DOUBLE PRECISION NOT NULL DEFAULT 60,
  -- Clamp real-world delay so testing never hangs and lore never feels broken.
  min_flight_seconds INTEGER    NOT NULL DEFAULT 5,
  max_flight_seconds INTEGER    NOT NULL DEFAULT 86400,  -- 24h hard cap

  -- Compose constraints (tuned during testing).
  max_chars         INTEGER     NOT NULL DEFAULT 280,
  scroll_font       TEXT        NOT NULL DEFAULT 'Cinzel',  -- placeholder olde font

  -- Sprite / image asset filenames (resolved against the frontend scroll-asset
  -- folder). Placeholders until the real art lands.
  scroll_bg_file    TEXT        NOT NULL DEFAULT 'scroll_blank.png',
  seal_open_file    TEXT        NOT NULL DEFAULT 'seal_open.png',
  seal_stamped_file TEXT        NOT NULL DEFAULT 'seal_stamped.png',
  send_branch_file  TEXT        NOT NULL DEFAULT 'branch_send.png',
  land_branch_file  TEXT        NOT NULL DEFAULT 'branch_land.png',

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single settings row.
INSERT INTO scrolls_settings (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed 12 starter frames per layer with linear coordinate interpolation, so the
-- animation plays sensibly out of the box. Tune / add frames later in /admin.
--   send: low-left (x5,y70) -> high-right (x95,y10)
--   land: high-right (x95,y10) -> low-right (x80,y65)
INSERT INTO scrolls_frames (layer, frame_order, sprite_file, x, y)
SELECT 'send', g,
       format('crow_send_%s.png', lpad(g::text, 2, '0')),
       5  + g * (90.0 / 11.0),
       70 - g * (60.0 / 11.0)
FROM generate_series(0, 11) AS g
ON CONFLICT (layer, frame_order) DO NOTHING;

INSERT INTO scrolls_frames (layer, frame_order, sprite_file, x, y)
SELECT 'land', g,
       format('crow_land_%s.png', lpad(g::text, 2, '0')),
       95 - g * (15.0 / 11.0),
       10 + g * (55.0 / 11.0)
FROM generate_series(0, 11) AS g
ON CONFLICT (layer, frame_order) DO NOTHING;
