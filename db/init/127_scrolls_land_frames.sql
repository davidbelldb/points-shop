-- The landing sequence is 11 frames (crow_land_00..10), not 12. Re-seed with a
-- starter high-right -> low-right path at 200ms/frame; David tunes the
-- coordinates in /admin (scrolls-config).
DELETE FROM scrolls_frames WHERE layer = 'land';

INSERT INTO scrolls_frames (layer, frame_order, sprite_file, x, y, duration_ms)
SELECT 'land', g,
       format('crow_land_%s.png', lpad(g::text, 2, '0')),
       95 - g * (15.0 / 10.0),   -- x: 95 -> 80
       10 + g * (55.0 / 10.0),   -- y: 10 (high) -> 65 (low)
       200
FROM generate_series(0, 10) AS g;
