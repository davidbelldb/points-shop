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
