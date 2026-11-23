-- ---------------------------------------------------------------------------
-- Scroll display font: ImperialBlack -> Ananda Namaste.
--
-- The web scrolls read scrolls_settings.scroll_font and match it to an
-- @font-face family of the same name in index.css (now 'AnandaNamaste',
-- backed by /scrolls/fonts/NamasteRegular.ttf). Single-row config.
-- ---------------------------------------------------------------------------
UPDATE scrolls_settings
   SET scroll_font = 'AnandaNamaste',
       updated_at  = NOW()
 WHERE id = TRUE;
