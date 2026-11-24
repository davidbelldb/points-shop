-- ---------------------------------------------------------------------------
-- Swap the takeoff/send-animation frames (crow_send_00..12) to the recoloured
-- roller sprites (crow_send_00-1 … crow_send_12-1). Appends "-1" before .png for
-- every frame in the send layer. Idempotent — skips any already ending in -1.png.
-- Mirrors 178 (which did the same for the land layer). The compose/takeoff crow
-- in /messages reads these, so this is what finally retires the old dark crow.
-- ---------------------------------------------------------------------------
UPDATE scrolls_frames
   SET sprite_file = regexp_replace(sprite_file, '\.png$', '-1.png')
 WHERE layer = 'send'
   AND sprite_file LIKE 'crow_send_%'
   AND sprite_file NOT LIKE '%-1.png';
