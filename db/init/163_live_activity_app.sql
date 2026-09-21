-- ---------------------------------------------------------------------------
-- Which app a push token belongs to.
--
-- Live Activity pushes are addressed to "<bundle id>.push-type.liveactivity",
-- and there are now two apps: the Capacitor one (com.david.sneakystuff) and the
-- native one (com.david.sneakysocial). A token registered by one is meaningless
-- to the other, so the row has to say which it is.
--
-- Defaults to 'capacitor' so every existing row keeps behaving exactly as it
-- did. Nothing about the Capacitor app changes.
-- ---------------------------------------------------------------------------
ALTER TABLE live_activity_tokens
  ADD COLUMN IF NOT EXISTS app TEXT NOT NULL DEFAULT 'capacitor';

ALTER TABLE apns_tokens
  ADD COLUMN IF NOT EXISTS app TEXT NOT NULL DEFAULT 'capacitor';

CREATE INDEX IF NOT EXISTS live_activity_tokens_pts
    ON live_activity_tokens (account_id, kind, app);
