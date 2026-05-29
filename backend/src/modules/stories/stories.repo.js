import { query } from '../../db.js';

const COLUMNS = `
  s.id, s.author_id, s.media_url, s.media_type, s.caption,
  s.duration_seconds, s.stickers, s.thumbnail_url,
  s.created_at, s.expires_at,
  a.name     AS author_name,
  a.username AS author_username,
  a.photo_url AS author_photo
`;

/* Stories with expires_at still in the future. Newest first. UI groups
   client-side by author so each person gets one circle in the strip.
   hidden_at filters out stories that have been removed from the feed but
   kept in a highlight reel. */
export async function listActive() {
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.expires_at > NOW()
        AND s.hidden_at IS NULL
      ORDER BY s.created_at DESC`,
  );
  return rows;
}

/* Archived stories — expired. Optional date window for the calendar's
   per-month view. Pass empty strings to fetch everything. Excludes
   stories that have been hidden from the feed (still in reels). */
export async function listArchive(fromIso, toIso) {
  if (fromIso && toIso) {
    const { rows } = await query(
      `SELECT ${COLUMNS}
         FROM sneaky_stories s
         JOIN accounts a ON a.id = s.author_id
        WHERE s.expires_at <= NOW()
          AND s.hidden_at IS NULL
          AND s.created_at >= $1
          AND s.created_at <  $2
        ORDER BY s.created_at DESC`,
      [fromIso, toIso],
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.expires_at <= NOW()
        AND s.hidden_at IS NULL
      ORDER BY s.created_at DESC`,
  );
  return rows;
}

export async function getStory(id) {
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createStory(authorId, { media_url, media_type, caption, duration_seconds, stickers, thumbnail_url }) {
  if (!media_url) throw httpError(400, 'media_url required');
  if (!['image', 'video', 'audio'].includes(media_type)) {
    throw httpError(400, 'media_type must be image, video, or audio');
  }
  // Clamp duration to 1..60s; null means "use the client default".
  let dur = null;
  if (duration_seconds != null) {
    const n = Number(duration_seconds);
    if (Number.isFinite(n)) dur = Math.max(1, Math.min(60, Math.round(n)));
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
  return rows[0];
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
