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
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID ?? '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
    // Must match the redirect URI registered in your Spotify Developer Dashboard.
    // Production: https://yourdomain.com/api/spotify/callback
    redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:3001/api/spotify/callback',
  },
};
