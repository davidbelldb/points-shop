-- ---------------------------------------------------------------------------
-- Which APNs gateway a token belongs to.
--
-- A build run from Xcode gets a SANDBOX token; a TestFlight or App Store build
-- gets a production one, and the two gateways reject each other's tokens with
-- BadDeviceToken. The server had one global switch, which is fine with one app
-- and impossible with two when one of them is still being developed.
--
-- Defaults to 'production', so every existing row — and the Capacitor app,
-- which never sends this — keeps going to exactly the gateway it does today.
-- ---------------------------------------------------------------------------
ALTER TABLE live_activity_tokens
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';

ALTER TABLE apns_tokens
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production';
