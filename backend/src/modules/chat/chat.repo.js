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
            m.edited_at, m.reaction, m.reply_to_story_id, m.reply_to_message_id,
            s.username AS sender_username,
            s.name     AS sender_name,
            s.photo_url AS sender_photo,
            st.media_url   AS story_media_url,
            st.media_type  AS story_media_type,
            st.caption     AS story_caption,
            st.author_id   AS story_author_id,
            sta.name       AS story_author_name,
            rm.body        AS reply_to_body,
            rm.sender_id   AS reply_to_sender_id,
            rms.name       AS reply_to_sender_name
       FROM chat_messages m
       JOIN accounts s   ON s.id  = m.sender_id
       LEFT JOIN sneaky_stories  st  ON st.id  = m.reply_to_story_id
       LEFT JOIN accounts        sta ON sta.id = st.author_id
       LEFT JOIN chat_messages   rm  ON rm.id  = m.reply_to_message_id
       LEFT JOIN accounts        rms ON rms.id = rm.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
      LIMIT $3`,
    [accountId, otherId, limit],
  );
  return rows;
}

// Edit a message's body. Only the original sender may edit. Sets edited_at.
export async function editMessage(messageId, accountId, body) {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    const err = new Error('Message body required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `UPDATE chat_messages
        SET body = $1, edited_at = NOW()
      WHERE id = $2 AND sender_id = $3
      RETURNING id, sender_id, recipient_id, body, read_at, created_at, edited_at, reaction`,
    [trimmed, messageId, accountId],
  );
  if (rows.length === 0) {
    const err = new Error('Message not found or not yours');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

// Map of reaction key → emoji used in notification copy. Keep in sync with
// the frontend's render map and the routes-level ALLOWED_REACTIONS whitelist.
const REACTION_EMOJI = { heart: '💜' };

// Set or clear a single reaction on a message. Either participant may react.
// When a NEW reaction is applied to the OTHER person's message, the sender
// gets an in-app notification + web-push. Clearing a reaction does not
// notify, and reacting to your own message does not notify (no one to tell).
export async function setReaction(messageId, accountId, reaction) {
  const value = reaction ? String(reaction) : null;
  const { rows } = await query(
    `UPDATE chat_messages
        SET reaction = $1
      WHERE id = $2
        AND (sender_id = $3 OR recipient_id = $3)
      RETURNING id, sender_id, recipient_id, body, read_at, created_at, edited_at, reaction`,
    [value, messageId, accountId],
  );
  if (rows.length === 0) {
    const err = new Error('Message not found');
    err.statusCode = 404;
    throw err;
  }
  const updated = rows[0];

  // Notify only on add-or-change to a non-null reaction, and only when the
  // reactor isn't the original message sender (you don't notify yourself).
  if (value && accountId !== updated.sender_id) {
    const reactorRes = await query(`SELECT name FROM accounts WHERE id = $1`, [accountId]);
    const reactorName = reactorRes.rows[0]?.name ?? 'Someone';
    const emoji = REACTION_EMOJI[value] ?? '👍';
    const bodyText = updated.body ?? '';
    const preview = bodyText.length > 80 ? bodyText.slice(0, 77) + '...' : bodyText;
    const title = `${reactorName} reacted ${emoji}`;

    await query(
      `INSERT INTO notifications (account_id, type, title, body, link_url)
       VALUES ($1, 'message', $2, $3, '/messages')`,
      [updated.sender_id, title, preview],
    );
    sendPush(updated.sender_id, { title, body: preview, url: '/messages' });
  }

  return updated;
}

export async function sendMessage(senderId, recipientId, body, replyToStoryId = null, replyToMessageId = null) {
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Message body required');
    err.statusCode = 400;
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO chat_messages (sender_id, recipient_id, body, reply_to_story_id, reply_to_message_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, sender_id, recipient_id, body, created_at, read_at, edited_at, reaction, reply_to_story_id, reply_to_message_id`,
    [senderId, recipientId, trimmed, replyToStoryId || null, replyToMessageId || null],
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
