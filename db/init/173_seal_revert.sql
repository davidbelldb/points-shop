-- ---------------------------------------------------------------------------
-- Revert the wax seal art back to the original (non-India) files.
-- Undoes 172_seal_india.sql. Single-row config (id = TRUE).
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET seal_open_file    = 'seal_unstamped.png',
       seal_stamped_file = 'seal_stamped.png',
       updated_at        = NOW()
 WHERE id = TRUE;
