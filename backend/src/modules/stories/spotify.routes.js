/* Spotify OAuth integration for the "Now Playing" story sticker.
   Flow overview:
     1. /api/spotify/auth    → browser opens as popup, redirects to Spotify consent.
     2. /api/spotify/callback → Spotify returns here with ?code=. We exchange for
        tokens, store them, then return an HTML page that postMessages the parent
        window and closes itself.
     3. /api/spotify/now-playing → reads the currently playing track using the
        stored access token (auto-refreshes when expired).

   The state parameter is used to associate the callback with the logged-in user,
   since SameSite cookie restrictions may prevent the session cookie from being
   sent on the cross-site redirect back from Spotify. */

import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { config } from '../../config.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const SPOTIFY_ACCOUNTS = 'https://accounts.spotify.com';
const SPOTIFY_API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-currently-playing user-read-playback-state';

// Short-lived in-memory state store to survive the cross-site redirect.
// state (UUID) → { accountId, expiresAt }. Max 10 min TTL.
const pendingStates = new Map();

function createState(accountId) {
  const state = randomUUID();
  pendingStates.set(state, { accountId, expiresAt: Date.now() + 10 * 60 * 1000 });
  // Tidy up expired entries opportunistically.
  for (const [k, v] of pendingStates) {
    if (v.expiresAt < Date.now()) pendingStates.delete(k);
  }
  return state;
}

function consumeState(state) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry.accountId;
}

function basicAuth() {
  return Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
}

async function refreshAccessToken(accountId, refreshToken) {
  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth()}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error('Spotify token refresh failed');
  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  if (data.refresh_token) {
    await pool.query(
      'UPDATE spotify_tokens SET access_token=$1, refresh_token=$2, expires_at=$3 WHERE account_id=$4',
      [data.access_token, data.refresh_token, expiresAt, accountId]
    );
  } else {
    await pool.query(
      'UPDATE spotify_tokens SET access_token=$1, expires_at=$2 WHERE account_id=$3',
      [data.access_token, expiresAt, accountId]
    );
  }
  return data.access_token;
}

async function getValidAccessToken(accountId) {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, expires_at FROM spotify_tokens WHERE account_id=$1',
    [accountId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  // Refresh proactively if expiring within 60 s.
  if (new Date(row.expires_at).getTime() - Date.now() < 60_000) {
    return refreshAccessToken(accountId, row.refresh_token);
  }
  return row.access_token;
}

// Inline HTML page returned to the popup after OAuth completes.
function popupHtml(messageObj) {
  const json = JSON.stringify(messageObj);
  return `<!DOCTYPE html><html><body><script>
  try { window.opener.postMessage(${json}, '*'); } catch(e) {}
  window.close();
<\/script></body></html>`;
}

export default async function spotifyRoutes(fastify) {
  /* ── Auth initiation ──────────────────────────────────────────────── */
  fastify.get('/api/spotify/auth', async (req, reply) => {
    if (!config.spotify.clientId || !config.spotify.clientSecret) {
      return reply.code(503).send({ error: 'Spotify not configured on this server' });
    }
    const accountId = getEffectiveAccountId(req);
    const state = createState(accountId);
    const params = new URLSearchParams({
      client_id: config.spotify.clientId,
      response_type: 'code',
      redirect_uri: config.spotify.redirectUri,
      scope: SCOPES,
      state,
      show_dialog: 'false',
    });
    return reply.redirect(`${SPOTIFY_ACCOUNTS}/authorize?${params}`);
  });

  /* ── OAuth callback ───────────────────────────────────────────────── */
  fastify.get('/api/spotify/callback', async (req, reply) => {
    const { code, error, state } = req.query ?? {};

    if (error || !code) {
      return reply.type('text/html').send(
        popupHtml({ type: 'spotify_error', error: error ?? 'no_code' })
      );
    }

    const accountId = consumeState(state);
    if (!accountId) {
      return reply.type('text/html').send(
        popupHtml({ type: 'spotify_error', error: 'invalid_state' })
      );
    }

    try {
      const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth()}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.spotify.redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`token exchange ${res.status}`);
      const data = await res.json();
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      await pool.query(
        `INSERT INTO spotify_tokens (account_id, access_token, refresh_token, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id) DO UPDATE
           SET access_token  = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               expires_at    = EXCLUDED.expires_at`,
        [accountId, data.access_token, data.refresh_token, expiresAt]
      );

      return reply.type('text/html').send(popupHtml({ type: 'spotify_connected' }));
    } catch (e) {
      fastify.log.error({ err: e }, 'spotify callback error');
      return reply.type('text/html').send(
        popupHtml({ type: 'spotify_error', error: 'server_error' })
      );
    }
  });

  /* ── Connection status ────────────────────────────────────────────── */
  fastify.get('/api/spotify/status', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const { rows } = await pool.query(
      'SELECT 1 FROM spotify_tokens WHERE account_id=$1',
      [accountId]
    );
    return { connected: rows.length > 0 };
  });

  /* ── Currently playing track ──────────────────────────────────────── */
  fastify.get('/api/spotify/now-playing', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      const accessToken = await getValidAccessToken(accountId);
      if (!accessToken) return reply.code(404).send({ error: 'not connected' });

      const res = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status === 204) return { playing: false };
      if (!res.ok) return reply.code(res.status).send({ error: 'spotify api error' });

      const data = await res.json();
      if (!data?.item) return { playing: false };

      return {
        playing: true,
        title: data.item.name,
        artist: data.item.artists?.map((a) => a.name).join(', ') ?? '',
        album: data.item.album?.name ?? '',
      };
    } catch (e) {
      fastify.log.error({ err: e }, 'spotify now-playing error');
      return reply.code(500).send({ error: 'internal error' });
    }
  });

  /* ── Disconnect ───────────────────────────────────────────────────── */
  fastify.delete('/api/spotify/disconnect', async (req) => {
    const accountId = getEffectiveAccountId(req);
    await pool.query('DELETE FROM spotify_tokens WHERE account_id=$1', [accountId]);
    return { ok: true };
  });
}
