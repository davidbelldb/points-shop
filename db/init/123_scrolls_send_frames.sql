-- Re-seed the send (flight) sequence to 13 frames (crow_send_00..12) and start
-- the crow half off the left edge: coordinates are allowed out of bounds (x < 0
-- and x > 100), so the crow flies in from off-screen left, low, and exits off
-- the right edge, high. Tune further in /admin (scrolls-config).
DELETE FROM scrolls_frames WHERE layer = 'send';

INSERT INTO scrolls_frames (layer, frame_order, sprite_file, x, y)
SELECT 'send', g,
       format('crow_send_%s.png', lpad(g::text, 2, '0')),
       -15 + g * (130.0 / 12.0),   -- x: -15 (half off left) -> 115 (off right)
       70  - g * (60.0  / 12.0)    -- y: 70 (low) -> 10 (high)
FROM generate_series(0, 12) AS g;
