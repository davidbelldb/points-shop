-- Configurable 3D prop positions for the Shut the Box 15 scene.
-- pos_x / pos_z  : world-space position on the granite surface
-- rot_y_deg      : Y-axis (yaw) rotation in degrees — admin-friendly
-- scale          : uniform scale multiplier
-- active         : whether the prop renders at all

CREATE TABLE IF NOT EXISTS stb15_scene_props (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  pos_x       FLOAT NOT NULL DEFAULT 0,
  pos_z       FLOAT NOT NULL DEFAULT 0,
  rot_y_deg   FLOAT NOT NULL DEFAULT 0,
  scale       FLOAT NOT NULL DEFAULT 1.0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pos_x / pos_z used as described per key type:
--   3D models (bottle, kettle, twirl_*): world X/Z position on surface
--   layout keys (tiles_back, tiles_front, btn_panel): pos_z = baseZ / panel Z; scale unused (set 1)
INSERT INTO stb15_scene_props (key, label, pos_x, pos_z, rot_y_deg, scale, active) VALUES
  ('bottle',      'Wine Bottle',                  3.8,   2.6,  -17.0, 0.34, true),
  ('kettle',      'Electric Kettle',              4.8,  -3.8,  -34.0, 0.15, true),
  ('twirl_1',     'Choc Bar — Top Left',         -6.2,  -4.2,   63.0, 1.60, true),
  ('twirl_2',     'Choc Bar — Bottom Left',      -5.0,   3.8,  -23.0, 1.55, true),
  ('tiles_back',  'Loose tiles — behind box',     0.0,  -4.8,    0.0, 1.00, true),
  ('tiles_front', 'Loose tiles — in front of box',0.0,   2.3,    0.0, 0.825,true),
  ('btn_panel',   '2 Dice / 1 Die button panel',  0.0,   4.0,    0.0, 1.00, true)
ON CONFLICT (key) DO NOTHING;
