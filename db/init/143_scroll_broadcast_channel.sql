-- Broadcast-channel push for the crow Live Activity.
-- Each scroll gets an APNs broadcast channel; the push-to-start subscribes the
-- recipient's activity to it (input-push-channel), and street updates + the
-- landing are broadcast to the channel — so they reach a locked/closed phone
-- with no device-captured update token needed (the Apple Sports model).
ALTER TABLE scrolls
  ADD COLUMN IF NOT EXISTS la_channel_id TEXT;
