-- Full 3-axis rotation for scene props (twirls need X/Z control)
ALTER TABLE stb15_scene_props ADD COLUMN IF NOT EXISTS rot_x_deg FLOAT NOT NULL DEFAULT 0;
ALTER TABLE stb15_scene_props ADD COLUMN IF NOT EXISTS rot_z_deg FLOAT NOT NULL DEFAULT 0;

-- Bottle needs -90° X rotation to stand upright (was handled in code, now in DB)
UPDATE stb15_scene_props SET rot_x_deg = -90 WHERE key = 'bottle';

-- Box position/scale (scale affects visuals only; colliders stay proportional via code)
INSERT INTO stb15_scene_props (key, label, pos_x, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('box', 'Game Box', 0, 0, 0, 0, 0, 1.0, true)
ON CONFLICT (key) DO NOTHING;

-- Camera settings stored on the config singleton
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS camera_pos_x FLOAT NOT NULL DEFAULT 0;
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS camera_pos_y FLOAT NOT NULL DEFAULT 10.5;
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS camera_pos_z FLOAT NOT NULL DEFAULT 7.8;
ALTER TABLE stb15_config ADD COLUMN IF NOT EXISTS camera_fov   FLOAT NOT NULL DEFAULT 46;
