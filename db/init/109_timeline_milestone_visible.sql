-- Lets the admin hide a milestone from the public /timeline page without
-- deleting it (e.g. drafts, or events that haven't happened yet).
ALTER TABLE timeline_milestones
  ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true;
