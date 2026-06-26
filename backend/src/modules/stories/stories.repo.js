import { query } from '../../db.js';
import { sendPush } from '../notifications/push.js';

const COLUMNS = `
  s.id, s.author_id, s.media_url, s.media_type, s.caption,
  s.duration_seconds, s.stickers, s.thumbnail_url,
  s.created_at, s.expires_at,
  a.name     AS author_name,
  a.username AS author_username,
  a.photo_url AS author_photo,
  (SELECT COUNT(*) FROM story_views v
    WHERE v.story_id = s.id AND v.viewer_id <> s.author_id)::int AS view_count_other,
  COALESCE(
    (SELECT json_agg(json_build_object('id', va.id, 'name', va.name, 'photo', va.photo_url, 'viewed_at', v.viewed_at))
       FROM story_views v JOIN accounts va ON va.id = v.viewer_id
      WHERE v.story_id = s.id AND v.viewer_id <> s.author_id),
    '[]'::json
  ) AS viewers
`;

// Caller-scoped column — needs the viewer's account id as a param.
function callerViewedColumn(paramIndex) {
  return `EXISTS(SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = $${paramIndex}) AS viewed_by_me`;
}

/* Stories with expires_at still in the future. Newest first. UI groups
   client-side by author so each person gets one circle in the strip.
   hidden_at filters out stories that have been removed from the feed but
   kept in a highlight reel. callerId enables the viewed_by_me flag. */
export async function listActive(callerId = null) {
  const { rows } = await query(
    `SELECT ${COLUMNS}, ${callerViewedColumn(1)}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.expires_at > NOW()
        AND s.hidden_at IS NULL
      ORDER BY s.created_at DESC`,
    [callerId],
  );
  return rows;
}

/* Archived stories — expired. Optional date window for the calendar's
   per-month view. Pass empty strings to fetch everything. Excludes
   stories that have been hidden from the feed (still in reels). */
export async function listArchive(fromIso, toIso, callerId = null) {
  if (fromIso && toIso) {
    const { rows } = await query(
      `SELECT ${COLUMNS}, ${callerViewedColumn(3)}
         FROM sneaky_stories s
         JOIN accounts a ON a.id = s.author_id
        WHERE s.expires_at <= NOW()
          AND s.hidden_at IS NULL
          AND s.created_at >= $1
          AND s.created_at <  $2
        ORDER BY s.created_at DESC`,
      [fromIso, toIso, callerId],
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT ${COLUMNS}, ${callerViewedColumn(1)}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.expires_at <= NOW()
        AND s.hidden_at IS NULL
      ORDER BY s.created_at DESC`,
    [callerId],
  );
  return rows;
}

export async function getStory(id, callerId = null) {
  const { rows } = await query(
    `SELECT ${COLUMNS}, ${callerViewedColumn(2)}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.id = $1`,
    [id, callerId],
  );
  return rows[0] ?? null;
}

/* Replies to a story — chat messages threaded to it via reply_to_story_id.
   Used by the viewer to float Instagram-style reply bubbles over the media.
   Returns each reply with the responder's name + profile photo, oldest first
   so the UI can stack newest at the bottom. Slider stickers also post a
   chat reply, so we skip rows that are pure slider responses (no real text)
   to avoid floating cryptic "42%" bubbles over the story. */
export async function listStoryReplies(storyId, limit = 30) {
  if (!storyId) return [];
  const { rows } = await query(
    `SELECT m.id, m.body, m.created_at, m.sender_id,
            a.name      AS sender_name,
            a.photo_url AS sender_photo
       FROM chat_messages m
       JOIN accounts a ON a.id = m.sender_id
      WHERE m.reply_to_story_id = $1
        AND m.slider_response IS NULL
        AND COALESCE(TRIM(m.body), '') <> ''
      ORDER BY m.created_at ASC
      LIMIT $2`,
    [storyId, limit],
  );
  return rows;
}

/* Record that `viewerId` has viewed `storyId`. Idempotent — re-opening
   a story doesn't bump the timestamp. Authors viewing their own story
   are a no-op (the UI doesn't count author self-views as a "seen"). */
export async function markStoryViewed(storyId, viewerId) {
  if (!viewerId || !storyId) return;
  await query(
    `INSERT INTO story_views (story_id, viewer_id)
     SELECT $1, $2
       FROM sneaky_stories s
      WHERE s.id = $1 AND s.author_id <> $2
     ON CONFLICT DO NOTHING`,
    [storyId, viewerId],
  );
}

export async function createStory(authorId, { media_url, media_type, caption, duration_seconds, stickers, thumbnail_url }) {
  if (!media_url) throw httpError(400, 'media_url required');
  if (!['image', 'video', 'audio'].includes(media_type)) {
    throw httpError(400, 'media_type must be image, video, or audio');
  }
  // Image display duration (seconds). No upper cap; floor of 1s. null means
  // "use the client default".
  let dur = null;
  if (duration_seconds != null) {
    const n = Number(duration_seconds);
    if (Number.isFinite(n)) dur = Math.max(1, Math.round(n));
  }
  // Cap stickers payload — we only render a handful and the JSONB column
  // shouldn't be a soft DOS vector. 6 max sticker objects, each must look
  // like a plain object. The client owns the inner shape.
  const safeStickers = Array.isArray(stickers)
    ? stickers
        .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
        .slice(0, 6)
    : [];
  const { rows } = await query(
    `INSERT INTO sneaky_stories (author_id, media_url, media_type, caption, duration_seconds, stickers, thumbnail_url)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     RETURNING id, author_id, media_url, media_type, caption, duration_seconds, stickers, thumbnail_url, created_at, expires_at`,
    [authorId, media_url, media_type, caption ? String(caption).trim() : null, dur, JSON.stringify(safeStickers), thumbnail_url || null],
  );
  const story = rows[0];
  // Let the other person know a sneaky story just dropped. Fire-and-forget so
  // a notification hiccup can never fail the story upload itself.
  notifyStoryPosted(authorId, story.thumbnail_url || story.media_url).catch(() => {});
  return story;
}

/* Drops an in-app notification + web push to the OTHER account (the app only
   has two) whenever someone posts a story. Never throws. */
async function notifyStoryPosted(authorId, imagePath) {
  const { rows } = await query(
    `SELECT id AS other_id,
            (SELECT name FROM accounts WHERE id = $1) AS author_name
       FROM accounts
      WHERE id <> $1
      LIMIT 1`,
    [authorId],
  );
  const other = rows[0];
  if (!other?.other_id) return;
  const title = `${other.author_name || 'Someone'} posted a sneaky story`;
  const body = 'Tap to take a peek';
  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'story', $2, $3, '/')`,
    [other.other_id, title, body],
  );
  // Absolute https URL so the iOS Notification Service Extension can fetch the
  // thumbnail and show it in the expanded push.
  const image = imagePath
    ? (/^https?:\/\//i.test(imagePath) ? imagePath : `https://sneakypoints.com${imagePath}`)
    : null;
  sendPush(other.other_id, { title, body, url: '/', image });
}

/* Smart delete: if the story is currently linked from any highlight reel
   we soft-hide it (sets hidden_at) so it disappears from the live feed and
   the archive vault but persists inside the reels it's been saved to. If
   it isn't in any reel, we hard-delete the row (and CASCADE handles any
   stray rows). When the LAST reel link is later removed (see
   removeStoryFromReel) the row is auto-purged.
   Author-only: throws 403 if the caller isn't the story's original
   author, and 404 if the story doesn't exist. */
export async function deleteStory(id, accountId) {
  const { rows: ownerRows } = await query(
    `SELECT author_id FROM sneaky_stories WHERE id = $1`,
    [id],
  );
  if (ownerRows.length === 0) throw httpError(404, 'not found');
  if (ownerRows[0].author_id !== accountId) {
    throw httpError(403, 'only the author can delete this story');
  }
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM reel_stories WHERE story_id = $1`,
    [id],
  );
  if ((rows[0]?.n ?? 0) > 0) {
    await query(
      `UPDATE sneaky_stories SET hidden_at = COALESCE(hidden_at, NOW()) WHERE id = $1`,
      [id],
    );
    return { mode: 'hidden' };
  }
  await query(`DELETE FROM sneaky_stories WHERE id = $1`, [id]);
  return { mode: 'deleted' };
}

function httpError(code, msg) {
  const err = new Error(msg);
  err.statusCode = code;
  return err;
}
