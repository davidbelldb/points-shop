import path from 'path';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { extractVideoThumbnail } from '../media/transcode.js';

/* Backfill poster thumbnails for video stories that pre-date the
   thumbnail_url column. Runs in the background after server boot —
   fire-and-forget, never throws past its own handler. */
export async function backfillVideoThumbnails(logger) {
  let { rows } = await query(
    `SELECT id, media_url
       FROM sneaky_stories
      WHERE media_type = 'video' AND (thumbnail_url IS NULL OR thumbnail_url = '')`,
  );
  if (rows.length === 0) {
    logger?.debug?.('No video stories needing thumbnail backfill');
    return;
  }
  logger?.info?.({ count: rows.length }, 'Backfilling story video thumbnails');
  for (const r of rows) {
    // media_url is something like /media/abc.mp4 — resolve back to a path on disk.
    const filename = path.basename(r.media_url || '');
    if (!filename) continue;
    const filepath = path.join(config.mediaDir, filename);
    try {
      const thumb = await extractVideoThumbnail(filepath);
      if (!thumb) {
        logger?.warn?.({ id: r.id, filename }, 'thumbnail extract returned null');
        continue;
      }
      const thumb_url = `/media/${thumb.filename}`;
      await query(`UPDATE sneaky_stories SET thumbnail_url = $1 WHERE id = $2`, [thumb_url, r.id]);
      logger?.info?.({ id: r.id, thumb_url }, 'Story thumbnail filled');
    } catch (err) {
      logger?.error?.({ id: r.id, err: err?.message }, 'Thumbnail backfill failed for story');
    }
  }
}
