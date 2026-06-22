import http2 from 'node:http2';
import crypto from 'node:crypto';
import { query } from '../../db.js';
import { config } from '../../config.js';

/*
 * APNs (Apple Push Notification service) sender for the native iOS app.
 *
 * Token-based auth: we sign a short-lived ES256 JWT with the .p8 Auth Key and
 * send alerts over HTTP/2. Implemented with Node built-ins only (node:http2 +
 * node:crypto) — no extra dependency to install or audit.
 *
 * Fire-and-forget, exactly like web push: never throws, so a delivery failure
 * can't break the request that triggered the notification.
 */

const HOST = config.apns.production
  ? 'https://api.push.apple.com'
  : 'https://api.sandbox.push.apple.com';

let privateKey = null;
if (config.apns.keyBase64) {
  try {
    const pem = Buffer.from(config.apns.keyBase64, 'base64').toString('utf8');
    privateKey = crypto.createPrivateKey(pem);
  } catch (err) {
    // Malformed key — leave APNs disabled rather than crashing the server.
    privateKey = null;
  }
}

const enabled = !!(privateKey && config.apns.keyId && config.apns.teamId && config.apns.bundleId);

export function apnsEnabled() {
  return enabled;
}

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// APNs accepts a provider token for up to 1 hour. Cache and refresh well inside
// that window to avoid TooManyProviderTokenUpdates throttling.
let cachedJwt = null;
let cachedAt = 0;
function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedAt < 50 * 60) return cachedJwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.apns.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.apns.teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  // ES256 in JOSE form = raw r||s (64 bytes); dsaEncoding 'ieee-p1363' gives us
  // exactly that instead of Node's default DER encoding.
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  cachedJwt = `${signingInput}.${b64url(signature)}`;
  cachedAt = now;
  return cachedJwt;
}

function buildPayload(payload) {
  // 'clear' is a web-only action (closing a shown notification via the service
  // worker). APNs has no equivalent, so skip those — nothing to deliver.
  if (payload.action === 'clear') return null;
  return JSON.stringify({
    aps: {
      alert: { title: payload.title || 'Sneaky Stuff', body: payload.body || '' },
      sound: 'default',
      'thread-id': payload.tag || 'sneaky',
    },
    url: payload.url || '/',
  });
}

/**
 * Send a push to every iOS device an account has registered.
 * Dead tokens (410 / BadDeviceToken) are pruned automatically.
 */
export async function sendApns(accountId, payload) {
  if (!enabled || !accountId) return;
  const body = buildPayload(payload);
  if (!body) return;

  let tokens;
  try {
    const { rows } = await query(
      `SELECT token FROM apns_tokens WHERE account_id = $1`,
      [accountId],
    );
    tokens = rows;
  } catch {
    return;
  }
  if (!tokens || tokens.length === 0) return;

  let client;
  try {
    client = http2.connect(HOST);
    client.on('error', () => {});
    const jwt = providerToken();

    await Promise.all(tokens.map((t) => new Promise((resolve) => {
      let status = 0;
      let data = '';
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${t.token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': config.apns.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
      });
      req.setEncoding('utf8');
      req.on('response', (headers) => { status = headers[':status']; });
      req.on('data', (chunk) => { data += chunk; });
      req.on('error', () => resolve());
      req.on('end', async () => {
        if (status !== 200) {
          // Surface Apple's rejection reason (InvalidProviderToken, TopicDisallowed,
          // BadDeviceToken, etc.) — invaluable during bring-up.
          console.error(`[apns] send failed: ${status} ${data}`);
        }
        // 410 = device unregistered; 400 BadDeviceToken = stale. Drop either.
        if (status === 410 || (status === 400 && data.includes('BadDeviceToken'))) {
          await query(`DELETE FROM apns_tokens WHERE token = $1`, [t.token]).catch(() => {});
        }
        resolve();
      });
      req.end(body);
    })));
  } catch {
    /* swallow — push delivery must never break the originating request */
  } finally {
    try { if (client) client.close(); } catch { /* ignore */ }
  }
}
