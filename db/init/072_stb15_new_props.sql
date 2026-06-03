-- New scene prop entries: cup (GLB), banana (procedural)
INSERT INTO stb15_scene_props (key, label, pos_x, pos_z, rot_x_deg, rot_y_deg, rot_z_deg, scale, active) VALUES
  ('cup',    'Cup',    -3.5,  2.8,  0,   20,  0,  1.0,  true),
  ('banana', 'Banana',  2.5, -3.2,  0,  -15,  0,  1.0,  true)
ON CONFLICT (key) DO NOTHING;
