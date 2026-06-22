import path from 'path';

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 3001),
  host: process.env.BACKEND_HOST ?? '0.0.0.0',
  postgres: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
  mediaDir: process.env.MEDIA_DIR ?? path.resolve(process.cwd(), '..', 'media'),
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@sneakypoints.com',
  },
  apns: {
    // Token-based auth (.p8 key). The key file is passed as base64 so it can
    // live on one line in .env. Key ID + Team ID come from the Apple Developer
    // portal; bundleId is the app's bundle identifier (apns-topic).
    keyId: process.env.APNS_KEY_ID ?? '',
    teamId: process.env.APNS_TEAM_ID ?? '',
    bundleId: process.env.APNS_BUNDLE_ID ?? 'com.david.sneakystuff',
    keyBase64: process.env.APNS_AUTH_KEY_BASE64 ?? '',
    // TestFlight and App Store builds use the PRODUCTION APNs gateway.
    // Set APNS_PRODUCTION=false only for a development (Xcode-to-device) build.
    production: (process.env.APNS_PRODUCTION ?? 'true') !== 'false',
  },
  lastfm: {
    apiKey: process.env.LASTFM_API_KEY ?? '',
  },
  fatsecret: {
    clientId: process.env.FATSECRET_CLIENT_ID ?? '',
    clientSecret: process.env.FATSECRET_CLIENT_SECRET ?? '',
  },
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
  },
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  },
};
