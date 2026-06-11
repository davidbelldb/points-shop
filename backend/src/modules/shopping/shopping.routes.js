/**
 * Sneaky shopping list — shared list + Open Food Facts proxy.
 *
 * OFF requests go through the backend so we can set a proper User-Agent
 * (per OFF API etiquette), sidestep CORS, and cache responses — the
 * household doesn't need to hammer a volunteer-run service.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';

const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_UA = 'SneakyPoints/1.0 (private household app)';
const OFF_FIELDS = 'product_name,brands,image_small_url,code';

// Tiny in-memory cache: key → { at, data }
const offCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

async function offFetch(url) {
  const hit = offCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const res = await fetch(url, { headers: { 'User-Agent': OFF_UA } });
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const data = await res.json();
  offCache.set(url, { at: Date.now(), data });
  if (offCache.size > 500) offCache.delete(offCache.keys().next().value);
  return data;
}

const shapeOffProduct = (p) => ({
  name: p?.product_name?.trim() || null,
  brand: (p?.brands ?? '').split(',')[0].trim() || null,
  image_url: p?.image_small_url ?? null,
  barcode: p?.code ?? null,
});

const shapeItem = (r) => ({
  id: r.id,
  name: r.name,
  qty: r.qty,
  image_url: r.image_url,
  barcode: r.barcode,
  checked: r.checked,
  added_by: r.added_by,
  created_at: r.created_at,
});

async function bumpHistory(name, imageUrl, barcode) {
  const key = name.trim().toLowerCase();
  if (!key) return;
  await query(
    `INSERT INTO shopping_history (name_key, name, image_url, barcode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name_key) DO UPDATE SET
       times_used = shopping_history.times_used + 1,
       last_used  = NOW(),
       image_url  = COALESCE(EXCLUDED.image_url, shopping_history.image_url),
       barcode    = COALESCE(EXCLUDED.barcode, shopping_history.barcode)`,
    [key, name.trim(), imageUrl ?? null, barcode ?? null],
  ).catch(() => {});
}

export default async function shoppingRoutes(fastify) {
  const requireAuth = (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) {
      reply.code(401).send({ error: 'Not authenticated' });
      return null;
    }
    return accountId;
  };

  // GET /api/shopping/items — unchecked first, newest first within groups.
  fastify.get('/api/shopping/items', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(
      `SELECT * FROM shopping_items ORDER BY checked, created_at DESC`,
    );
    return { items: rows.map(shapeItem) };
  });

  // POST /api/shopping/items — add (also feeds the usuals history).
  fastify.post('/api/shopping/items', async (req, reply) => {
    const accountId = requireAuth(req, reply);
    if (!accountId) return;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 120);
    if (!name) return reply.code(400).send({ error: 'Name required' });
    const imageUrl = (req.body?.image_url ?? null) || null;
    const barcode = (req.body?.barcode ?? null) || null;
    const qty = Math.max(1, Math.min(99, Number(req.body?.qty) || 1));

    const { rows } = await query(
      `INSERT INTO shopping_items (name, qty, image_url, barcode, added_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, qty, imageUrl, barcode, accountId],
    );
    await bumpHistory(name, imageUrl, barcode);
    return shapeItem(rows[0]);
  });

  // PATCH /api/shopping/items/:id — tick off, change qty, rename.
  fastify.patch('/api/shopping/items/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });

    const fields = [];
    const values = [];
    let i = 1;
    const { checked, qty, name } = req.body ?? {};
    if (typeof checked === 'boolean') {
      fields.push(`checked = $${i++}`); values.push(checked);
      fields.push(`checked_at = ${checked ? 'NOW()' : 'NULL'}`);
    }
    if (qty !== undefined) {
      fields.push(`qty = $${i++}`); values.push(Math.max(1, Math.min(99, Number(qty) || 1)));
    }
    if (typeof name === 'string' && name.trim()) {
      fields.push(`name = $${i++}`); values.push(name.trim().slice(0, 120));
    }
    if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
    values.push(id);
    const { rows } = await query(
      `UPDATE shopping_items SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Item not found' });
    return shapeItem(rows[0]);
  });

  // DELETE /api/shopping/items/:id
  fastify.delete('/api/shopping/items/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    await query(`DELETE FROM shopping_items WHERE id = $1`, [id]);
    return { ok: true };
  });

  // POST /api/shopping/clear-checked — sweep away everything ticked off.
  fastify.post('/api/shopping/clear-checked', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    await query(`DELETE FROM shopping_items WHERE checked = TRUE`);
    return { ok: true };
  });

  // GET /api/shopping/suggest?q= — "your usuals" from purchase history.
  fastify.get('/api/shopping/suggest', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = (req.query?.q ?? '').toString().trim().toLowerCase().slice(0, 60);
    if (!q) return { suggestions: [] };
    const { rows } = await query(
      `SELECT name, image_url, barcode FROM shopping_history
        WHERE name_key LIKE '%' || $1 || '%'
        ORDER BY times_used DESC, last_used DESC
        LIMIT 6`,
      [q],
    );
    return { suggestions: rows };
  });

  // GET /api/shopping/off-search?q= — Open Food Facts text search (proxied).
  fastify.get('/api/shopping/off-search', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = (req.query?.q ?? '').toString().trim().slice(0, 60);
    if (q.length < 3) return { products: [] };
    try {
      const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=${OFF_FIELDS}`;
      const data = await offFetch(url);
      const products = (data.products ?? [])
        .map(shapeOffProduct)
        .filter((p) => p.name);
      return { products };
    } catch (err) {
      req.log.warn({ err }, 'OFF search failed');
      return { products: [] }; // soft-fail — history suggestions still work
    }
  });

  // GET /api/shopping/off-product/:barcode — barcode lookup (proxied).
  fastify.get('/api/shopping/off-product/:barcode', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const barcode = (req.params.barcode ?? '').toString().replace(/\D/g, '').slice(0, 20);
    if (!barcode) return reply.code(400).send({ error: 'Bad barcode' });
    try {
      const data = await offFetch(`${OFF_BASE}/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`);
      if (data.status !== 1 || !data.product) return { found: false, barcode };
      return { found: true, product: shapeOffProduct(data.product) };
    } catch (err) {
      req.log.warn({ err }, 'OFF product lookup failed');
      return { found: false, barcode };
    }
  });
}
