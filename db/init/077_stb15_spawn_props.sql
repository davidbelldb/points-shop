-- Spawn position for twirl that falls when tile 15 is closed
INSERT INTO stb15_scene_props (key, label, pos_x, pos_y, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('spawn_twirl', 'Spawn: Twirl (tile 15)', 0, 6, 0, 0, 0, 0, 1.4, true)
ON CONFLICT (key) DO NOTHING;

-- Spawn position for clip that falls when tile 14 is closed
INSERT INTO stb15_scene_props (key, label, pos_x, pos_y, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('spawn_clip', 'Spawn: Clip (tile 14)', 0, 6, 0, 0, 0, 0, 0.0133, true)
ON CONFLICT (key) DO NOTHING;
