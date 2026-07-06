import path from 'path';
import { mkdir, unlink, stat } from 'fs/promises';
import { config } from '../../config.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import archiver from 'archiver';
import {
  listAllProducts,
  getAdminProduct,
  createProduct,
  updateProduct,
  setInventory,
  addProductMedia,
  deleteProductMedia,
  updateAccount,
  adjustPoints,
  changeOtherUserPassword,
} from './admin.repo.js';
import { listAllOrders, updateOrderStatus } from '../orders/orders.repo.js';
import { transcodeVideoIfNeeded } from '../media/transcode.js';
import { optimizeImage } from '../media/image.js';
import { listStoriesForExport } from '../stories/stories.repo.js';

const MEDIA_DIR = config.mediaDir;

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.qt', '.hevc']);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.webm']);

// Permissive media-type classifier. iPhone records HEVC into .mov with
// mimetype 'video/quicktime', but other browsers / OSes send vague or empty
// mimetypes (especially for audio). We trust the high-level type/* prefix
// AND fall back to file extension when the mimetype is missing or generic.
function classifyMimetype(mimetype = '', filename = '') {
  const mt = (mimetype || '').toLowerCase();
  const ext = (filename ? path.extname(filename) : '').toLowerCase();

  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('video/')) return 'video';
  if (mt.startsWith('audio/')) return 'audio';

  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';

  return null;
}

// --- Story export helpers (see /api/admin/stories/export below) ---

// Zip entry paths can't contain slashes/backslashes from free-text names —
// flatten them so a stray "/" in someone's display name can't escape the
// per-author folder.
function sanitizeZipSegment(s, fallback) {
  const clean = String(s ?? '').replace(/[\\/]+/g, '-').trim();
  return clean || fallback;
}

// Short, readable, collision-safe filename for one story's media inside the
// zip: date + first 8 chars of the id (always unique) + an optional caption
// slug for human browsing.
function storyExportFilename(story) {
  const dateStr = new Date(story.created_at).toISOString().slice(0, 10);
  const shortId = String(story.id).slice(0, 8);
  const ext = path.extname(story.media_url || '') ||
    (story.media_type === 'video' ? '.mp4' : story.media_type === 'audio' ? '.m4a' : '.jpg');
  const captionSlug = String(story.caption ?? '')
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${dateStr}_${shortId}${captionSlug ? `_${captionSlug}` : ''}${ext}`;
}

export default async function adminRoutes(fastify) {
  await mkdir(MEDIA_DIR, { recursive: true });

  fastify.post('/api/admin/upload', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });
    const type = classifyMimetype(data.mimetype, data.filename);
    if (!type) {
      return reply.code(415).send({ error: `Unsupported type: ${data.mimetype}` });
    }
    const ext = path.extname(data.filename) || '';
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const filepath = path.join(MEDIA_DIR, filename);
    try {
      await pipeline(data.file, createWriteStream(filepath));
      if (data.file.truncated) {
        await unlink(filepath).catch(() => {});
        return reply.code(413).send({ error: 'File too large' });
      }
    } catch (err) {
      await unlink(filepath).catch(() => {});
      throw err;
    }
    // Same H.264+AAC normalisation as /api/upload so admin-side uploads
    // (product videos, hero slides, etc.) also play in every browser.
    const out = await transcodeVideoIfNeeded(filepath, type);
    let mediaUrl = `/media/${out.filename}`;
    if (type === 'image') {
      // Re-encode to WebP capped at 1600px — product photos / hero slides
      // come straight off a phone camera otherwise, and the storefront
      // never displays them anywhere near full resolution. Soft-fails:
      // keeps the original if sharp can't read it.
      const optimized = await optimizeImage(out.filepath, ext);
      if (optimized.optimized) {
        mediaUrl = `/media/${optimized.filename}`;
      } else if (optimized.error) {
        req.log?.warn({ filename, err: optimized.error }, 'image optimize skipped');
      }
    }
    return { url: mediaUrl, type, mimetype: data.mimetype };
  });

  /* Bulk export — zips up every Sneaky Story ever posted (photos + videos,
     including ones soft-hidden into a highlight reel) for offline backup.
     ?account_id=<uuid> filters to one author; omit or pass "all" for both.
     Streams straight from disk with no intermediate temp file, and skips
     any story whose media file has since gone missing rather than failing
     the whole export. */
  fastify.get('/api/admin/stories/export', async (req, reply) => {
    const accountIdParam = String(req.query?.account_id ?? 'all').trim();
    const authorId = accountIdParam === 'all' ? null : accountIdParam;

    const stories = await listStoriesForExport(authorId);
    if (stories.length === 0) {
      return reply.code(404).send({ error: 'No stories found for that filter' });
    }

    const who = authorId
      ? sanitizeZipSegment(stories[0].author_name, 'user').toLowerCase().replace(/\s+/g, '-')
      : 'all';
    const zipFilename = `sneaky-stories-${who}-${new Date().toISOString().slice(0, 10)}.zip`;

    // Media is already JPEG/WebP/MP4 — all pre-compressed — so store (no
    // re-deflate) is both faster and doesn't waste CPU for near-zero gain.
    const archive = archiver('zip', { store: true });
    archive.on('warning', (err) => req.log.warn({ err }, 'stories export zip warning'));
    archive.on('error', (err) => req.log.error({ err }, 'stories export zip error'));

    reply.header('Content-Disposition', `attachment; filename="${zipFilename}"`);
    reply.type('application/zip');
    reply.send(archive);

    for (const story of stories) {
      const filename = path.basename(story.media_url || '');
      if (!filename) continue;
      const filepath = path.join(MEDIA_DIR, filename);
      try {
        await stat(filepath);
      } catch {
        continue; // file missing on disk — skip rather than abort the export
      }
      const baseName = storyExportFilename(story);
      const entryName = authorId
        ? baseName
        : `${sanitizeZipSegment(story.author_name, 'unknown')}/${baseName}`;
      archive.file(filepath, { name: entryName, store: true });
    }

    await archive.finalize();
  });

  fastify.get('/api/admin/products', async () => listAllProducts());

  fastify.post('/api/admin/products', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.sku || !b.name || !Number.isInteger(b.price_points)) {
      return reply.code(400).send({ error: 'sku, name, price_points (integer) required' });
    }
    if (b.price_points < 0) return reply.code(400).send({ error: 'price_points must be >= 0' });
    try {
      const created = await createProduct(b);
      return reply.code(201).send(created);
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'SKU already exists' });
      }
      throw err;
    }
  });

  fastify.patch('/api/admin/products/:id', async (req) =>
    updateProduct(req.params.id, req.body ?? {}),
  );

  fastify.patch('/api/admin/products/:id/inventory', async (req, reply) => {
    const { stock_qty, lead_time_days } = req.body ?? {};
    if (!Number.isInteger(stock_qty) || stock_qty < 0) {
      return reply.code(400).send({ error: 'stock_qty must be a non-negative integer' });
    }
    if (!Number.isInteger(lead_time_days) || lead_time_days < 0) {
      return reply.code(400).send({ error: 'lead_time_days must be a non-negative integer' });
    }
    await setInventory(req.params.id, stock_qty, lead_time_days);
    return getAdminProduct(req.params.id);
  });

  fastify.post('/api/admin/products/:id/media', async (req, reply) => {
    const { url, media_type, sort_order = 0 } = req.body ?? {};
    if (!url || !['image', 'video'].includes(media_type)) {
      return reply.code(400).send({ error: 'url and media_type (image|video) required' });
    }
    return addProductMedia(req.params.id, { url, media_type, sort_order });
  });

  fastify.delete('/api/admin/media/:mediaId', async (req) => {
    await deleteProductMedia(req.params.mediaId);
    return { deleted: true };
  });


  fastify.get('/api/admin/orders', async (req) => {
    const limit = Math.min(Number(req.query?.limit ?? 100), 500);
    return listAllOrders(limit);
  });

  fastify.patch('/api/admin/orders/:id', async (req, reply) => {
    const { status, reason } = req.body ?? {};
    if (!status) return reply.code(400).send({ error: 'status required' });
    try {
      const updated = await updateOrderStatus(req.params.id, status, reason);
      if (!updated) return reply.code(404).send({ error: 'Order not found' });
      return updated;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
  fastify.patch('/api/admin/account', async (req) => {
    await updateAccount(req.body ?? {});
    return { updated: true };
  });

  fastify.patch('/api/admin/other-account/password', async (req, reply) => {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || password.length < 6) {
      return reply.code(400).send({ error: 'Password must be at least 6 characters' });
    }
    try {
      await changeOtherUserPassword(password);
      return { updated: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.post('/api/admin/account/credit', async (req, reply) => {
    const { delta, reason, target_account_id } = req.body ?? {};
    if (!Number.isInteger(delta) || delta === 0) {
      return reply.code(400).send({ error: 'delta must be a non-zero integer' });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return reply.code(400).send({ error: 'reason (string) required' });
    }
    try {
      const points_balance = await adjustPoints(delta, reason.trim(), target_account_id || null);
      return { points_balance };
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
  });
}
