-- ---------------------------------------------------------------------------
-- Swap the wax seal art to the India-themed files.
--   seal_open_file    = the unstamped seal (compose "Seal & send" button)
--   seal_stamped_file = the stamped seal (reader "Close", list "Open")
-- The tracker's pen-scroll seal is hardcoded in CrowTrackerPage.jsx (updated there).
-- Single-row config (id = TRUE). Revert to the non-india files when the theme ends.
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET seal_open_file    = 'seal_unstamped_india.png',
       seal_stamped_file = 'seal_stamped_india.png',
       updated_at        = NOW()
 WHERE id = TRUE;
