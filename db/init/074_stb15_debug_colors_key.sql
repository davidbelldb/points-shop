-- Admin toggle for the in-scene debug win button
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS show_debug_win BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-prop colour override (hex string e.g. '#c8a020'); NULL = use model's own materials
ALTER TABLE stb15_scene_props ADD COLUMN IF NOT EXISTS color_override TEXT;

-- Key model scene prop entry (Y-up, height ~13.7 units → scale 0.07 ≈ 0.96 world units)
INSERT INTO stb15_scene_props (key, label, pos_x, pos_y, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('key', 'Key', 1.5, 0, -2.0, 0, 45, 0, 0.07, true)
ON CONFLICT (key) DO NOTHING;
