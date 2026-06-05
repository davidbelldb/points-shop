-- Spawn position for duck that drops when tiles 1, 5, or 10 are closed
INSERT INTO stb15_scene_props (key, label, pos_x, pos_y, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active)
VALUES ('spawn_duck', 'Spawn: Duck (tiles 1/5/10)', 0, 6, 0, 0, 0, 0, 1.0, true)
ON CONFLICT (key) DO NOTHING;
