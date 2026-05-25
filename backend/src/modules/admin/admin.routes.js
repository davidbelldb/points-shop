import path from 'path';
import { mkdir, unlink } from 'fs/promises';
import { config } from '../../config.js';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
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
} from './admin.repo.js';
import { listAllOrders, updateOrderStatus } from '../orders/orders.repo.js';

const MEDIA_DIR = config.mediaDir;

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ALLOWED_AUDIO = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/aac', 'audio/x-aac', 'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/webm', 'audio/ogg', 'audio/oga',
]);
const AUDIO_EXTS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga']);

function classifyMimetype(mimetype, filename) {
  if (ALLOWED_IMAGE.has(mimetype)) return 'image';
  if (ALLOWED_VIDEO.has(mimetype)) return 'video';
  if (ALLOWED_AUDIO.has(mimetype)) return 'audio';
  // Some browsers/OSes report a vague or missing mimetype for audio files
  // (m4a especially) — trust an unambiguous audio file extension.
  const ext = (filename ? path.extname(filename) : '').toLowerCase();
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return null;
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
    return { url: `/media/${filename}`, type, mimetype: data.mimetype };
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
