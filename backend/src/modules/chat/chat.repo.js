import { query } from '../../db.js';
import { sendPush } from '../notifications/push.js';

export async function findOtherUser(accountId) {
  const { rows } = await query(
    `SELECT id, username, name, photo_url, role
       FROM accounts
      WHERE id != $1
      ORDER BY
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        created_at
      LIMIT 1`,
    [accountId],
  );
  return rows[0] ?? null;
}

export async function listMessages(accountId, otherId, limit = 200) {
  const { rows } = await query(
    `SELECT m.id, m.sender_id, m.recipient_id, m.body, m.read_at, m.created_at,
            s.username AS sender_username,
            s.name     AS sender_name,
            s.photo_url AS sender_photo
       FROM chat_messages m
       JOIN accounts s ON s.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
      LIMIT $3`,
    [accountId, otherId, limit],
  );
  return rows;
}

export async function sendMessage(senderId, recipientId, body) {
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Message body required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO chat_messages (sender_id, recipient_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, recipient_id, body, created_at, read_at`,
    [senderId, recipientId, trimmed],
  );

  const senderRes = await query(`SELECT name FROM accounts WHERE id = $1`, [senderId]);
  const senderName = senderRes.rows[0]?.name ?? 'Someone';
  const preview = trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed;

  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'message', $2, $3, '/messages')`,
    [recipientId, `New message from ${senderName}`, preview],
  );
  sendPush(recipientId, { title: `New message from ${senderName}`, body: preview, url: '/messages' });

  return rows[0];
}

export async function markAllRead(accountId, fromUserId) {
  await query(
    `UPDATE chat_messages SET read_at = NOW()
      WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`,
    [accountId, fromUserId],
  );
  await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE account_id = $1 AND type = 'message' AND read_at IS NULL`,
    [accountId],
  );
}

export async function deleteMessage(messageId, accountId) {
  await query(
    `DELETE FROM chat_messages WHERE id = $1 AND sender_id = $2`,
    [messageId, accountId],
  );
}
