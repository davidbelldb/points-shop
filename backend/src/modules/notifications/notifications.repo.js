import { query } from '../../db.js';
import { getDefaultAccountId } from '../accounts/accounts.repo.js';

export async function listNotifications(limit = 50) {
  const accountId = getDefaultAccountId();
  const { rows } = await query(
    `SELECT id, type, title, body, link_url, read_at, created_at
       FROM notifications
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [accountId, limit],
  );
  return rows;
}

export async function unreadCount() {
  const accountId = getDefaultAccountId();
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
       FROM notifications
      WHERE account_id = $1 AND read_at IS NULL`,
    [accountId],
  );
  return rows[0].count;
}

export async function markAllRead() {
  const accountId = getDefaultAccountId();
  await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE account_id = $1 AND read_at IS NULL`,
    [accountId],
  );
}
