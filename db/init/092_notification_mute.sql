-- Per-account "quiet hours" toggle, set by an admin, e.g. to stop a partner's
-- phone buzzing with game-turn pushes while testing on their account via
-- impersonation. sendPush() skips delivery while NOW() < notifications_muted_until.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notifications_muted_until TIMESTAMPTZ;
