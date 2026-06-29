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

function buildPayload(payload, badge) {
  // 'clear' is a web-only action (closing a shown notification via the service
  // worker). APNs has no equivalent, so skip those — nothing to deliver.
  if (payload.action === 'clear') return null;
  const aps = {
    alert: { title: payload.title || 'Sneaky Stuff', body: payload.body || '' },
    sound: 'default',
    'thread-id': payload.tag || 'sneaky',
  };
  // App-icon badge = the recipient's unread notification count.
  if (Number.isFinite(badge)) aps.badge = badge;
  // Category ties the push to a registered set of actions (e.g. the chat
  // "Reply" text-input action defined in AppDelegate).
  if (payload.category) aps.category = payload.category;
  // Rich push: when an image URL is supplied, flag the payload mutable so the
  // Notification Service Extension can download + attach it (e.g. a story
  // thumbnail shown in the expanded banner).
  const extra = {};
  if (payload.image) {
    aps['mutable-content'] = 1;
    extra.image = payload.image;
  }
  return JSON.stringify({ aps, url: payload.url || '/', ...extra });
}

// Swift encodes Date in Codable as seconds since the reference date
// 2001-01-01 UTC (unix 978307200). The Live Activity content-state JSON we push
// must use the same base so `startedAt`/`arrivesAt` decode correctly.
const REF_DATE = 978307200;
function toRefDate(ms) { return Math.round((ms / 1000 - REF_DATE) * 1000) / 1000; }

/** Build the crow activity's ContentState in Swift-Codable form. `message` is
 *  always included (Swift requires the key) — "" means "use the default subtitle". */
export function crowContentState({ startedAtMs, arrivesAtMs, landed, message = '', phase = 0 }) {
  return {
    startedAt: toRefDate(startedAtMs),
    arrivesAt: toRefDate(arrivesAtMs),
    landed: !!landed,
    message: message || '',
    phase: Number(phase) || 0,
  };
}

/**
 * Send an ActivityKit Live Activity push to a single token.
 *  - event 'start'  → push-to-start (token is the account's pts token); needs attributes
 *  - event 'update' → token is the activity's update token; needs content-state
 *  - event 'end'    → dismiss the activity
 * Returns the HTTP status (0 on transport failure). Never throws.
 */
export async function sendLiveActivityPush(token, { event, contentState, attributes, alert, dismissalMs } = {}) {
  if (!enabled || !token) return 0;
  const aps = {
    timestamp: Math.floor(Date.now() / 1000),
    event,
    'content-state': contentState || {},
  };
  if (event === 'start') {
    aps['attributes-type'] = 'CrowActivityAttributes';
    aps.attributes = attributes || {};
  }
  if (alert) aps.alert = alert;
  if (event === 'end' && dismissalMs) aps['dismissal-date'] = Math.floor(dismissalMs / 1000);
  const body = JSON.stringify({ aps });

  return new Promise((resolve) => {
    let client;
    try {
      client = http2.connect(HOST);
      client.on('error', () => resolve(0));
      const jwt = providerToken();
      let status = 0;
      let data = '';
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': `${config.apns.bundleId}.push-type.liveactivity`,
        'apns-push-type': 'liveactivity',
        'apns-priority': '10',
      });
      req.setEncoding('utf8');
      req.on('response', (h) => { status = h[':status']; });
      req.on('data', (c) => { data += c; });
      req.on('error', () => { try { client.close(); } catch { /* ignore */ } resolve(0); });
      req.on('end', async () => {
        if (status !== 200) console.error(`[apns-la] ${event} failed: ${status} ${data}`);
        if (status === 410 || (status === 400 && /BadDeviceToken/.test(data))) {
          await query(`DELETE FROM live_activity_tokens WHERE token = $1`, [token]).catch(() => {});
        }
        try { client.close(); } catch { /* ignore */ }
        resolve(status);
      });
      req.end(body);
    } catch {
      try { if (client) client.close(); } catch { /* ignore */ }
      resolve(0);
    }
  });
}

/**
 * Silent "wake" push (content-available, no alert/sound). Nudges the recipient's
 * app to run briefly in the background so it can capture a freshly-started Live
 * Activity's update token — without which live street updates + the in-scroll
 * landing can't reach a phone that was locked when the crow set off.
 * Best-effort and silent: never shows anything, never throws.
 */
export async function sendSilentWake(accountId) {
  if (!enabled || !accountId) return;
  let token;
  try {
    const { rows } = await query(
      `SELECT token FROM apns_tokens WHERE account_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [accountId],
    );
    token = rows[0]?.token;
  } catch { return; }
  if (!token) return;

  const body = JSON.stringify({ aps: { 'content-available': 1 }, wake: 'crow' });
  let client;
  try {
    client = http2.connect(HOST);
    client.on('error', () => {});
    const jwt = providerToken();
    await new Promise((resolve) => {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': config.apns.bundleId,
        'apns-push-type': 'background',
        'apns-priority': '5',
      });
      req.on('response', () => {});
      req.on('error', () => resolve());
      req.on('end', () => resolve());
      req.end(body);
    });
  } catch {
    /* silent — a failed wake just falls back to the token-if-captured path */
  } finally {
    try { if (client) client.close(); } catch { /* ignore */ }
  }
}

/**
 * Send a push to every iOS device an account has registered.
 * Dead tokens (410 / BadDeviceToken) are pruned automatically.
 */
export async function sendApns(accountId, payload) {
  if (!enabled || !accountId) return;

  // Badge = how many unread notifications this account has right now.
  let badge;
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE account_id = $1 AND read_at IS NULL`,
      [accountId],
    );
    badge = rows[0]?.c;
  } catch { /* badge is best-effort */ }

  const body = buildPayload(payload, badge);
  if (!body) return;

  let tokens;
  try {
    // Only the most-recently-registered device token. TestFlight reinstalls
    // leave older (still briefly valid) tokens behind, which caused duplicate
    // banners — send to just the newest so each device gets exactly one.
    const { rows } = await query(
      `SELECT token FROM apns_tokens WHERE account_id = $1 ORDER BY updated_at DESC LIMIT 1`,
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
