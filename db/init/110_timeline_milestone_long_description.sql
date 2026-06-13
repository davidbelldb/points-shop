-- Adds an optional, longer-form description for a timeline milestone.
-- When set, the milestone's title becomes tappable on /timeline and opens a
-- modal showing this text (in addition to the short `description`).
ALTER TABLE timeline_milestones
  ADD COLUMN IF NOT EXISTS long_description TEXT NOT NULL DEFAULT '';
