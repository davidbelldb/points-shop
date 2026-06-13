/* Disk data hygiene — Sneaky Stories / Reels video uploads.
 *
 * Every story upload of media_type='video' lands as a file in MEDIA_DIR
 * (config.mediaDir), referenced by sneaky_stories.media_url (and an
 * optional poster thumbnail at thumbnail_url). Stories expire from the
 * live feed after 24h but the row + files persist indefinitely unless
 * saved into a highlight reel — so old video uploads quietly accumulate
 * on disk. This module lets an admin audit those uploads and selectively
 * remove the file(s) + DB row for anything older than MIN_AGE_DAYS.
 */
import path from 'path';
import { stat, unlink } from 'fs/promises';
import { pool, query } from '../../db.js';
import { config } from '../../config.js';

const MEDIA_DIR = config.mediaDir;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Cleanup eligibility threshold — see CLAUDE.md "Atomic State Mutations"
// note: this is enforced both here (for the UI badge) and again inside
// deleteVideoUploads() server-side before any row/file is removed.
export const MIN_AGE_DAYS = 14;

function filenameFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // media_url / thumbnail_url are stored as "/media/<filename>"
  return path.basename(url);
}

async function fileSize(url) {
  const filename = filenameFromUrl(url);
  if (!filename) return 0;
  try {
    const st = await stat(path.join(MEDIA_DIR, filename));
    return st.size;
  } catch {
    return 0; // file missing / already gone — not fatal
  }
}

/* List every uploaded reel/story video, newest-last, with disk usage and
   age so the admin dashboard can flag what's safe to clear. */
export async function listVideoUploads() {
  const { rows } = await query(`
    SELECT s.id, s.media_url, s.thumbnail_url, s.caption, s.created_at,
           s.expires_at, s.hidden_at,
           a.name AS author_name,
           (SELECT COUNT(*)::int FROM reel_stories rs WHERE rs.story_id = s.id) AS reel_count
      FROM sneaky_stories s
      JOIN accounts a ON a.id = s.author_id
     WHERE s.media_type = 'video'
     ORDER BY s.created_at ASC
  `);

  const now = Date.now();
  const items = [];
  for (const row of rows) {
    const ageDays = (now - new Date(row.created_at).getTime()) / MS_PER_DAY;
    const [mediaBytes, thumbBytes] = await Promise.all([
      fileSize(row.media_url),
      fileSize(row.thumbnail_url),
    ]);
    items.push({
      id: row.id,
      media_url: row.media_url,
      thumbnail_url: row.thumbnail_url,
      caption: row.caption,
      author_name: row.author_name,
      created_at: row.created_at,
      expires_at: row.expires_at,
      hidden_at: row.hidden_at,
      in_reel: row.reel_count > 0,
      age_days: Math.floor(ageDays),
      size_bytes: mediaBytes + thumbBytes,
      eligible: ageDays >= MIN_AGE_DAYS,
    });
  }
  return items;
}

/* Atomic per-item cleanup: delete the sneaky_stories row (which CASCADEs
   any reel_stories links), then best-effort unlink the media + thumbnail
   files from disk. The DB delete and the age check happen inside the same
   transaction (FOR UPDATE) so a story can't be re-saved into a reel or
   re-dated out from under us between the list call and the delete. Disk
   unlink happens only after a successful COMMIT — if it fails we've still
   removed the DB record (the file becomes an orphan, not a dangling
   reference), which the next storage scan can pick up. */
export async function deleteVideoUploads(ids) {
  const deleted = [];
  const skipped = [];
  let freedBytes = 0;

  for (const id of ids) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT media_url, thumbnail_url, media_type, created_at
           FROM sneaky_stories WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row || row.media_type !== 'video') {
        await client.query('ROLLBACK');
        skipped.push({ id, reason: 'not found' });
        continue;
      }
      const ageDays = (Date.now() - new Date(row.created_at).getTime()) / MS_PER_DAY;
      if (ageDays < MIN_AGE_DAYS) {
        await client.query('ROLLBACK');
        skipped.push({ id, reason: 'too recent' });
        continue;
      }
      await client.query(`DELETE FROM sneaky_stories WHERE id = $1`, [id]);
      await client.query('COMMIT');

      for (const url of [row.media_url, row.thumbnail_url]) {
        const filename = filenameFromUrl(url);
        if (!filename) continue;
        const filepath = path.join(MEDIA_DIR, filename);
        try {
          const st = await stat(filepath);
          await unlink(filepath);
          freedBytes += st.size;
        } catch {
          // already gone — nothing to free
        }
      }
      deleted.push(id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      skipped.push({ id, reason: err.message });
    } finally {
      client.release();
    }
  }

  return { deleted, skipped, freed_bytes: freedBytes };
}
