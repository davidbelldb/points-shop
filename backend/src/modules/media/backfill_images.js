import path from 'path';
import { stat } from 'fs/promises';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { optimizeImage } from './image.js';

const OPTIMIZABLE_EXTS = new Set(['.png', '.jpg', '.jpeg']);

// Tables/columns that store a `/media/<filename>` URL pointing at a
// user-uploaded image. New uploads already go through optimizeImage()
// (capped 1600px, WebP, quality 82) via /api/upload — these are the
// legacy rows from before that pipeline existed, still pointing at
// multi-MB PNG/JPEGs that get re-downloaded on every home/games page
// load (hero carousel + games carousel + product grid).
const TARGETS = [
  { table: 'hero_slides', column: 'image_url', idColumn: 'id' },
  { table: 'products', column: 'thumbnail_url', idColumn: 'id' },
  { table: 'product_media', column: 'url', idColumn: 'id' },
];

/* One-shot backfill: re-encodes legacy PNG/JPEG images referenced by the
   tables above to capped-1600px WebP (matching what new uploads already
   get), then rewrites every row referencing that file to the new .webp
   URL. Skips files that are already WebP/GIF/SVG, missing on disk, or
   that fail to re-encode. Runs in the background after server boot —
   fire-and-forget, never throws past its own handler.

   Rows are grouped by underlying filename before optimizing, because the
   same uploaded file can be referenced from more than one table (e.g. a
   product's thumbnail_url and its product_media row pointing at the same
   image) — optimizing once and updating every reference avoids leaving
   some rows pointing at a now-renamed/deleted .png. */
export async function backfillLegacyImages(logger) {
  // filename -> [{ table, column, idColumn, id }, ...]
  const byFilename = new Map();

  for (const target of TARGETS) {
    const { table, column, idColumn } = target;
    let rows;
    try {
      ({ rows } = await query(
        `SELECT ${idColumn} AS id, ${column} AS url
           FROM ${table}
          WHERE ${column} ~* '\\.(png|jpe?g)$'`,
      ));
    } catch (err) {
      logger?.error?.({ table, err: err?.message }, 'legacy image backfill query failed');
      continue;
    }
    for (const r of rows) {
      const filename = path.basename(r.url || '');
      const ext = path.extname(filename);
      if (!filename || !OPTIMIZABLE_EXTS.has(ext.toLowerCase())) continue;
      if (!byFilename.has(filename)) byFilename.set(filename, []);
      byFilename.get(filename).push({ ...target, id: r.id });
    }
  }

  if (byFilename.size === 0) {
    logger?.debug?.('No legacy images needing optimization');
    return;
  }
  logger?.info?.({ count: byFilename.size }, 'Backfilling legacy images to WebP');

  for (const [filename, refs] of byFilename) {
    const ext = path.extname(filename);
    const filepath = path.join(config.mediaDir, filename);
    try {
      await stat(filepath);
    } catch {
      logger?.warn?.({ filename, refs: refs.length }, 'legacy image file not found, skipping');
      continue;
    }
    try {
      const result = await optimizeImage(filepath, ext);
      if (!result.optimized) {
        logger?.warn?.({ filename, error: result.error }, 'legacy image optimize failed, skipping');
        continue;
      }
      const newUrl = `/media/${result.filename}`;
      for (const { table, column, idColumn, id } of refs) {
        try {
          await query(`UPDATE ${table} SET ${column} = $1 WHERE ${idColumn} = $2`, [newUrl, id]);
        } catch (err) {
          logger?.error?.({ table, id, err: err?.message }, 'Failed to update row to optimized image URL');
        }
      }
      logger?.info?.({ filename, newUrl, refs: refs.length }, 'Legacy image optimized to WebP');
    } catch (err) {
      logger?.error?.({ filename, err: err?.message }, 'Legacy image backfill failed');
    }
  }
}
