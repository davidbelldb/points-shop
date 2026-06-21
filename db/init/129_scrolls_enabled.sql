-- Feature flag for the scrolls (raven messages) feature in the live chat.
-- Defaults OFF so it stays hidden until launch; toggled on from /admin.
ALTER TABLE scrolls_settings
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;
