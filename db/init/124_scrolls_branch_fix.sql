-- Ensure the branch sprites are mapped to the correct sides (guards against an
-- admin save having swapped them).
UPDATE scrolls_settings
   SET send_branch_file = 'branch_send.png',
       land_branch_file = 'branch_land.png',
       updated_at       = NOW()
 WHERE id = TRUE;
