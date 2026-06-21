-- Point the scroll config at the real assets David supplied, and the wired font.
-- (seal_unstamped.png differs from the seeded default seal_open.png.)
UPDATE scrolls_settings
   SET scroll_bg_file    = 'scroll_blank.png',
       seal_open_file    = 'seal_unstamped.png',
       seal_stamped_file = 'seal_stamped.png',
       scroll_font       = 'ImperialBlack',
       updated_at        = NOW()
 WHERE id = TRUE;
