-- Hidden ("link only") stories. A secret story carries an unguessable token;
-- it is excluded from the OTHER person's live feed and archive, and can only be
-- opened via its direct link (e.g. written to an NFC tag). The author still
-- sees it in their own feed as normal.
ALTER TABLE sneaky_stories
  ADD COLUMN IF NOT EXISTS secret_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_sneaky_stories_secret_token
  ON sneaky_stories (secret_token)
  WHERE secret_token IS NOT NULL;
