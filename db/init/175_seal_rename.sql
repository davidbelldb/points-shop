-- ---------------------------------------------------------------------------
-- Point the seal settings at the recoloured, renamed files (cache-bust by name).
-- seal_open_file = unstamped seal; seal_stamped_file = stamped seal.
-- Single-row config (id = TRUE).
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET seal_open_file    = 'seal_unstamped-1.png',
       seal_stamped_file = 'seal_stamped-1.png',
       updated_at        = NOW()
 WHERE id = TRUE;
