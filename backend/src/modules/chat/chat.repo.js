import { query } from '../../db.js';
import { sendPush } from '../notifications/push.js';

export async function findOtherUser(accountId) {
  const { rows } = await query(
    `SELECT id, username, name, photo_url, role, typing_at
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

export async function setTyping(accountId) {
  await query(
    `UPDATE accounts SET typing_at = NOW() WHERE id = $1`,
    [accountId],
  );
}

export async function listMessages(accountId, otherId, limit = 200) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT m.id, m.sender_id, m.recipient_id, m.body, m.read_at, m.created_at,
              m.edited_at, m.reaction, m.reply_to_story_id, m.reply_to_message_id,
              m.slider_response, m.sparkled, m.secret_revealed_at,
              COALESCE((
                SELECT json_agg(json_build_object('account_id', pv.account_id, 'option_idx', pv.option_idx))
                  FROM chat_poll_votes pv WHERE pv.message_id = m.id
              ), '[]'::json) AS poll_votes,
              s.username AS sender_username,
              s.name     AS sender_name,
              s.photo_url AS sender_photo,
              st.media_url   AS story_media_url,
              st.media_type  AS story_media_type,
              st.caption     AS story_caption,
              st.author_id   AS story_author_id,
              st.stickers    AS story_stickers,
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
        ORDER BY m.created_at DESC
        LIMIT $3
     ) sub
     ORDER BY created_at ASC`,
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

// Cast or change a vote on a poll message. Returns all current votes for that message.
export async function votePoll(messageId, accountId, optionIdx) {
  await query(
    `INSERT INTO chat_poll_votes (message_id, account_id, option_idx)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, account_id) DO UPDATE SET option_idx = $3, voted_at = NOW()`,
    [messageId, accountId, optionIdx],
  );
  const { rows } = await query(
    `SELECT account_id, option_idx FROM chat_poll_votes WHERE message_id = $1`,
    [messageId],
  );
  return rows;
}

// Map of reaction key → emoji used in notification copy. Keep in sync with
// the frontend's render map and the routes-level ALLOWED_REACTIONS whitelist.
// Toggle the sparkled flag on a message. Either participant may sparkle it.
export async function toggleSparkle(messageId, accountId) {
  const { rows } = await query(
    `UPDATE chat_messages
        SET sparkled = NOT sparkled
      WHERE id = $1
        AND (sender_id = $2 OR recipient_id = $2)
      RETURNING id, sparkled`,
    [messageId, accountId],
  );
  return rows[0] ?? null;
}

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
    // The frontend sends the literal emoji as the reaction value (e.g. '💜').
    // REACTION_EMOJI only maps the legacy 'heart' key, so fall back to the
    // value itself rather than a hard-coded 👍 — that fallback was turning
    // every emoji reaction into a thumbs-up in the notification copy.
    const emoji = REACTION_EMOJI[value] ?? value;
    // Never echo the raw message body: secret messages would leak their
    // contents (e.g. "__secret__:I miss you") and media would show a URL.
    const preview = previewForBody(updated.body);
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

// Human-readable labels for system message bodies used in push notifications.
const SYSTEM_LABELS = {
  '__nudge__':        { title: (name) => `${name} nudged you!`,               preview: null },
  '__rain_twirl__':   { title: (name) => `${name} made it rain twirls`,       preview: null },
  '__rain_popcorn__': { title: (name) => `${name} made it rain popcorn`,      preview: null },
  '__rain_duck__':    { title: (name) => `${name} made it rain ducks`,        preview: null },
};

// Detect the type of a chat message body so we can write a meaningful
// push notification. Mirrors the frontend isAudioUrl / isUploadedPhoto logic.
function classifyMessage(body) {
  if (typeof body !== 'string') return 'message';
  if (SYSTEM_LABELS[body]) return 'system';
  const isMedia = body.startsWith('/media/') || /^https?:\/\//.test(body);
  if (!isMedia) return 'message';
  const lower = body.split('?')[0].toLowerCase();
  if (/\.(mp3|ogg|webm|m4a|wav|aac|opus)$/.test(lower)) return 'voice note';
  if (/\.gif$/.test(lower)) return 'GIF';
  if (/\.(jpg|jpeg|png|webp|heic|heif|avif)$/.test(lower)) return 'photo';
  return 'message';
}

// Build a notification-safe preview for a message body. Redacts secret-message
// contents entirely and renders media as a friendly label rather than a URL.
// Used by reaction notifications so they never leak the underlying message.
function previewForBody(body) {
  const trimmed = (body ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('__secret__:')) return '';   // never reveal secrets
  const type = classifyMessage(trimmed);
  if (type === 'system')     return '';
  if (type === 'voice note') return 'Voice note';
  if (type === 'GIF')        return 'GIF';
  if (type === 'photo')      return 'Photo';
  return trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
}

export async function sendMessage(senderId, recipientId, body, replyToStoryId = null, replyToMessageId = null, sliderResponse = null) {
  const trimmed = body.trim();
  if (!trimmed) {
    const err = new Error('Message body required');
    err.statusCode = 400;
    throw err;
  }
  // Sanity-clamp the slider payload so we don't store arbitrary JSON.
  let safeSlider = null;
  if (sliderResponse && typeof sliderResponse === 'object' && !Array.isArray(sliderResponse)) {
    const v = Number(sliderResponse.value);
    safeSlider = {
      sticker_index: Number.isFinite(Number(sliderResponse.sticker_index)) ? Math.max(0, Number(sliderResponse.sticker_index)) : 0,
      value: Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50,
      emoji: typeof sliderResponse.emoji === 'string' ? sliderResponse.emoji.slice(0, 16) : null,
    };
  }
  const { rows } = await query(
    `INSERT INTO chat_messages (sender_id, recipient_id, body, reply_to_story_id, reply_to_message_id, slider_response)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, sender_id, recipient_id, body, created_at, read_at, edited_at, reaction, reply_to_story_id, reply_to_message_id, slider_response`,
    [senderId, recipientId, trimmed, replyToStoryId || null, replyToMessageId || null, safeSlider ? JSON.stringify(safeSlider) : null],
  );

  const senderRes = await query(`SELECT name FROM accounts WHERE id = $1`, [senderId]);
  const senderName = senderRes.rows[0]?.name ?? 'Someone';

  const isSecret = trimmed.startsWith('__secret__:');
  const type = classifyMessage(trimmed);
  const systemLabel = SYSTEM_LABELS[trimmed];
  const title   = systemLabel
    ? systemLabel.title(senderName)
    : isSecret
    ? `${senderName} sent you a sneaky secret message`
    : `${senderName} sent you a sneaky ${type}`;
  const preview = systemLabel
    ? ''
    : isSecret
    ? ''
    : type === 'message'    ? (trimmed.length > 100 ? trimmed.slice(0, 97) + '...' : trimmed)
    : type === 'voice note' ? 'Voice note'
    : type === 'GIF'        ? 'GIF'
    :                         'Photo';

  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'message', $2, $3, '/messages')`,
    [recipientId, title, preview],
  );
  sendPush(recipientId, { title, body: preview, url: '/messages' });

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

// Mark a secret message as revealed — only the recipient can trigger this.
export async function revealSecretMessage(messageId, accountId) {
  const { rows } = await query(
    `UPDATE chat_messages
        SET secret_revealed_at = NOW()
      WHERE id = $1
        AND recipient_id = $2
        AND secret_revealed_at IS NULL
      RETURNING id, secret_revealed_at`,
    [messageId, accountId],
  );
  return rows[0] ?? null;
}

export async function deleteMessage(messageId, accountId) {
  await query(
    `DELETE FROM chat_messages WHERE id = $1 AND sender_id = $2`,
    [messageId, accountId],
  );
}
