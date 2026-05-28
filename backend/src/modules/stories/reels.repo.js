import { query } from '../../db.js';

/* Reels list — name, count, and a cover URL.
   Cover URL precedence:
     1. Custom uploaded cover_image_url (treated as an image)
     2. The story pinned via cover_story_id
     3. The most-recently-added story in the reel (latest cover fallback) */
export async function listReels() {
  const { rows } = await query(
    `SELECT r.id, r.name, r.cover_story_id, r.cover_image_url,
            r.created_by, r.created_at, r.updated_at,
            COUNT(rs.story_id)::int AS story_count,
            COALESCE(
              r.cover_image_url,
              cs.media_url,
              (SELECT s.media_url FROM reel_stories rs2
                 JOIN sneaky_stories s ON s.id = rs2.story_id
                WHERE rs2.reel_id = r.id
                ORDER BY rs2.added_at DESC LIMIT 1)
            ) AS cover_url,
            CASE
              WHEN r.cover_image_url IS NOT NULL THEN 'image'
              ELSE COALESCE(
                cs.media_type,
                (SELECT s.media_type FROM reel_stories rs2
                   JOIN sneaky_stories s ON s.id = rs2.story_id
                  WHERE rs2.reel_id = r.id
                  ORDER BY rs2.added_at DESC LIMIT 1)
              )
            END AS cover_media_type
       FROM story_reels r
       LEFT JOIN reel_stories rs ON rs.reel_id = r.id
       LEFT JOIN sneaky_stories cs ON cs.id = r.cover_story_id
      GROUP BY r.id, cs.media_url, cs.media_type
      ORDER BY MAX(rs.added_at) DESC NULLS LAST, r.created_at DESC`,
  );
  return rows;
}

/* Reel with its full ordered story list — used by the viewer when you tap
   a reel circle. Stories come back oldest-first so the viewer slideshow
   plays in chronological order. */
export async function getReel(id) {
  const r = await query(
    `SELECT id, name, cover_story_id, cover_image_url, created_by, created_at, updated_at
       FROM story_reels WHERE id = $1`,
    [id],
  );
  if (r.rows.length === 0) return null;
  const stories = await query(
    `SELECT s.id, s.author_id, s.media_url, s.media_type, s.caption,
            s.created_at, s.expires_at,
            a.name     AS author_name,
            a.username AS author_username,
            a.photo_url AS author_photo
       FROM reel_stories rs
       JOIN sneaky_stories s ON s.id = rs.story_id
       JOIN accounts a       ON a.id = s.author_id
      WHERE rs.reel_id = $1
      ORDER BY s.created_at ASC`,
    [id],
  );
  return { ...r.rows[0], stories: stories.rows };
}

/* Create a reel — and, if an initial_story_id is supplied, link that
   story and stamp it as the cover in a single round-trip. */
export async function createReel(accountId, { name, initial_story_id }) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw httpError(400, 'name required');

  const r = await query(
    `INSERT INTO story_reels (name, cover_story_id, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, name, cover_story_id, created_by, created_at, updated_at`,
    [cleanName, initial_story_id || null, accountId],
  );
  if (initial_story_id) {
    await query(
      `INSERT INTO reel_stories (reel_id, story_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [r.rows[0].id, initial_story_id],
    );
  }
  return r.rows[0];
}

export async function updateReel(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  if ('name' in patch) {
    const cleanName = String(patch.name ?? '').trim();
    if (!cleanName) throw httpError(400, 'name required');
    fields.push(`name = $${i++}`); values.push(cleanName);
  }
  if ('cover_story_id' in patch) {
    fields.push(`cover_story_id = $${i++}`); values.push(patch.cover_story_id || null);
  }
  if ('cover_image_url' in patch) {
    fields.push(`cover_image_url = $${i++}`); values.push(patch.cover_image_url || null);
  }
  if (fields.length === 0) return null;
  fields.push(`updated_at = NOW()`);
  values.push(id);
  const r = await query(
    `UPDATE story_reels SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, name, cover_story_id, created_by, created_at, updated_at`,
    values,
  );
  return r.rows[0] ?? null;
}

export async function deleteReel(id) {
  await query(`DELETE FROM story_reels WHERE id = $1`, [id]);
}

export async function addStoryToReel(reelId, storyId) {
  // Insert the link (idempotent). If the reel currently has no cover, adopt
  // this story as the new cover so the circle thumbnail updates.
  await query(
    `INSERT INTO reel_stories (reel_id, story_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [reelId, storyId],
  );
  await query(
    `UPDATE story_reels
        SET cover_story_id = COALESCE(cover_story_id, $2),
            updated_at     = NOW()
      WHERE id = $1`,
    [reelId, storyId],
  );
}

export async function removeStoryFromReel(reelId, storyId) {
  await query(`DELETE FROM reel_stories WHERE reel_id = $1 AND story_id = $2`, [reelId, storyId]);
  // If we just removed the current cover, pick the next-most-recent story as the cover.
  await query(
    `UPDATE story_reels r
        SET cover_story_id = (
              SELECT rs.story_id FROM reel_stories rs
               WHERE rs.reel_id = r.id
               ORDER BY rs.added_at DESC LIMIT 1
            ),
            updated_at = NOW()
      WHERE r.id = $1 AND r.cover_story_id = $2`,
    [reelId, storyId],
  );
}

function httpError(code, msg) {
  const err = new Error(msg);
  err.statusCode = code;
  return err;
}
