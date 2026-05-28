import { query } from '../../db.js';

const COLUMNS = `
  s.id, s.author_id, s.media_url, s.media_type, s.caption,
  s.duration_seconds,
  s.created_at, s.expires_at,
  a.name     AS author_name,
  a.username AS author_username,
  a.photo_url AS author_photo
`;

/* Stories with expires_at still in the future. Newest first. UI groups
   client-side by author so each person gets one circle in the strip. */
export async function listActive() {
  const { rows } = await query(
    `SELECT ${COLUMNS}
       FROM sneaky_stories s
       JOIN accounts a ON a.id = s.author_id
      WHERE s.expires_at > NOW()
      ORDER BY s.created_at DESC`,
  );
  return rows;
}

/* Archived stories — expired. Optional date window for the calendar's
   per-month view. Pass empty strings to fetch everything. */
export async function listArchive(fromIso, toIso) {
  if (fromIso && toIso) {
    const { rows } = await query(
      `SELECT ${COLUMNS}
         FROM sneaky_stories s
         JOIN accounts a ON a.id = s.author_id
        WHERE s.expires_at <= NOW()
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

export async function createStory(authorId, { media_url, media_type, caption, duration_seconds }) {
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
  const { rows } = await query(
    `INSERT INTO sneaky_stories (author_id, media_url, media_type, caption, duration_seconds)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, author_id, media_url, media_type, caption, duration_seconds, created_at, expires_at`,
    [authorId, media_url, media_type, caption ? String(caption).trim() : null, dur],
  );
  return rows[0];
}

export async function deleteStory(id, accountId) {
  // Either participant can delete — same shared-content semantics as the calendar.
  await query(`DELETE FROM sneaky_stories WHERE id = $1`, [id]);
}

function httpError(code, msg) {
  const err = new Error(msg);
  err.statusCode = code;
  return err;
}
