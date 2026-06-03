-- Per-prop vertical (Y) offset so objects can be raised above or sunk into the surface.
-- Default 0 = sits exactly on SURFACE_TOP_Y. Positive = lifts up, negative = lowers.
ALTER TABLE stb15_scene_props ADD COLUMN IF NOT EXISTS pos_y FLOAT NOT NULL DEFAULT 0;
