-- ---------------------------------------------------------------------------
-- Swap the landing-animation frames (crow_land_00..10) to the recoloured roller
-- sprites (crow_land_00-1 … crow_land_10-1). Appends "-1" before .png for every
-- frame in the land layer. Idempotent — skips any already ending in -1.png.
-- The chat perched bird reads the last land frame, so this swaps that too.
-- ---------------------------------------------------------------------------
UPDATE scrolls_frames
   SET sprite_file = regexp_replace(sprite_file, '\.png$', '-1.png')
 WHERE layer = 'land'
   AND sprite_file LIKE 'crow_land_%'
   AND sprite_file NOT LIKE '%-1.png';
