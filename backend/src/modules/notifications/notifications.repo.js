import { query } from '../../db.js';

export async function listNotifications(accountId, limit = 50) {
  const { rows } = await query(
    `SELECT id, type, title, body, link_url, read_at, created_at
       FROM notifications WHERE account_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [accountId, limit],
  );
  return rows;
}

export async function unreadCount(accountId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE account_id = $1 AND read_at IS NULL`,
    [accountId],
  );
  return rows[0].count;
}

export async function markAllRead(accountId) {
  await query(
    `UPDATE notifications SET read_at = NOW() WHERE account_id = $1 AND read_at IS NULL`,
    [accountId],
  );
}

export async function deleteNotification(id, accountId) {
  await query(`DELETE FROM notifications WHERE id = $1 AND account_id = $2`, [id, accountId]);
}

export async function deleteAllNotifications(accountId) {
  await query(`DELETE FROM notifications WHERE account_id = $1`, [accountId]);
}

export async function savePushSubscription(accountId, sub) {
  await query(
    `INSERT INTO push_subscriptions (account_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth`,
    [accountId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
}

export async function deletePushSubscription(endpoint) {
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

export async function saveApnsToken(accountId, token) {
  await query(
    `INSERT INTO apns_tokens (account_id, token)
     VALUES ($1, $2)
     ON CONFLICT (token) DO UPDATE
       SET account_id = EXCLUDED.account_id,
           updated_at = NOW()`,
    [accountId, token],
  );
}

export async function deleteApnsToken(token) {
  await query(`DELETE FROM apns_tokens WHERE token = $1`, [token]);
}
