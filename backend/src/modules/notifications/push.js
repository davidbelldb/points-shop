import webpush from 'web-push';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { sendApns, apnsEnabled } from './apns.js';

const enabled = !!(config.vapid.publicKey && config.vapid.privateKey);
if (enabled) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

export function pushEnabled() {
  return enabled || apnsEnabled();
}

async function isMuted(accountId) {
  const muted = await query(
    `SELECT 1 FROM accounts
      WHERE id = $1 AND notifications_muted_until IS NOT NULL AND notifications_muted_until > NOW()`,
    [accountId],
  );
  return muted.rows.length > 0;
}

/**
 * Web push to every browser/PWA an account has registered.
 * Fire-and-forget: never throws.
 */
async function sendWebPush(accountId, payload) {
  if (!enabled) return;
  const { rows } = await query(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE account_id = $1`,
    [accountId],
  );
  if (rows.length === 0) return;
  const body = JSON.stringify({
    title: payload.title || 'Sneaky Points',
    body: payload.body || '',
    url: payload.url || '/',
    action: payload.action || null,
    tag: payload.tag || 'sneaky-broadcast',
  });
  await Promise.all(rows.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
    } catch (err) {
      // 404/410 mean the subscription is dead — drop it.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.endpoint]).catch(() => {});
      }
    }
  }));
}

/**
 * Fire a notification to every device an account has registered — both web push
 * (browser/PWA) and APNs (native iOS app). Fire-and-forget: never throws, so a
 * push failure can't break the caller. The mute check runs once and gates both.
 * payload: { title, body, url, action?, tag? }
 */
export async function sendPush(accountId, payload) {
  if (!accountId) return;
  try {
    if (await isMuted(accountId)) return;
  } catch {
    return; // couldn't check mute state — skip rather than risk over-notifying
  }
  await Promise.all([
    sendWebPush(accountId, payload).catch(() => {}),
    sendApns(accountId, payload).catch(() => {}),
  ]);
}
