-- Second clip instance
INSERT INTO stb15_scene_props (key, label, pos_x, pos_y, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('clip_2', 'Clip 2', 2.0, 0, -2.0, 0, 0, 0, 1.0, true)
ON CONFLICT (key) DO NOTHING;
