import path from 'path';
import { unlink, rename } from 'fs/promises';

/* Shared image post-processing for both /api/upload (stories) and
   /api/admin/upload (product images, hero slides, etc).

   optimizeImage(): every uploaded photo gets re-encoded to WebP and capped
   at MAX_DIMENSION on its longest side. Phone cameras routinely produce
   3000-4000px / multi-MB JPEGs and HEICs; nothing in this app displays an
   image anywhere near that size (full-screen story view on an iPhone tops
   out around 1200-1300 CSS px @3x). Re-encoding at 1600px/quality 82
   typically shrinks a 2-4MB photo to 100-300KB with no visible quality
   loss, which matters a lot on cellular.

   generateImageThumbnail(): a small 320px WebP for list/grid views (story
   rings, product grids, gallery strips) where shipping the full-size image
   would be ~95% wasted bytes.

   Both are soft-fail — if sharp errors (corrupt file, unsupported HEIC
   variant, etc.) the original file is left untouched and the caller falls
   back to it. Animated GIFs and SVGs are skipped entirely (re-encoding a
   GIF to a still WebP would drop the animation; SVGs are already tiny). */

const SKIP_EXTS = new Set(['.gif', '.svg']);
const MAX_DIMENSION = 1600;
const THUMB_DIMENSION = 320;

export async function optimizeImage(filepath, ext = '') {
  if (SKIP_EXTS.has(ext.toLowerCase())) {
    return { filepath, filename: path.basename(filepath), optimized: false };
  }

  const dir = path.dirname(filepath);
  const base = path.basename(filepath, path.extname(filepath));
  const tmpPath = path.join(dir, `${base}.opt.webp`);
  const outPath = path.join(dir, `${base}.webp`);

  try {
    const { default: sharp } = await import('sharp');
    await sharp(filepath)
      .rotate() // respect EXIF orientation before stripping it
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(tmpPath);

    if (filepath !== outPath) await unlink(filepath).catch(() => {});
    await rename(tmpPath, outPath);
    return { filepath: outPath, filename: path.basename(outPath), optimized: true };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    return { filepath, filename: path.basename(filepath), optimized: false, error: err.message };
  }
}

export async function generateImageThumbnail(filepath, id) {
  try {
    const { default: sharp } = await import('sharp');
    const dir = path.dirname(filepath);
    const thumbName = `${id}_thumb.webp`;
    await sharp(filepath)
      .rotate()
      .resize({ width: THUMB_DIMENSION, height: THUMB_DIMENSION, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(path.join(dir, thumbName));
    return thumbName;
  } catch {
    return null;
  }
}

export function isOptimizable(ext = '') {
  return !SKIP_EXTS.has(ext.toLowerCase());
}
