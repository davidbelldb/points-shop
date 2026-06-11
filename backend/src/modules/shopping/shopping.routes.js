/**
 * Sneaky shopping list — shared list + Open Food Facts proxy.
 *
 * OFF requests go through the backend so we can set a proper User-Agent
 * (per OFF API etiquette), sidestep CORS, and cache responses — the
 * household doesn't need to hammer a volunteer-run service.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';
import { config } from '../../config.js';

// Tiny in-memory cache: key → { at, data }
const offCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

// ── FatSecret Platform — THE product provider (testing FatSecret-only) ───────
// OAuth2 client credentials; token cached until near expiry.
// Configure FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET in .env.
const FS_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FS_API_URL = 'https://platform.fatsecret.com/rest/server.api';
let fsToken = null; // { token, exp }

const fsEnabled = () => !!(config.fatsecret.clientId && config.fatsecret.clientSecret);

async function fsGetToken() {
  if (!fsEnabled()) return null;
  if (fsToken && Date.now() < fsToken.exp - 60_000) return fsToken.token;
  const basic = Buffer.from(`${config.fatsecret.clientId}:${config.fatsecret.clientSecret}`).toString('base64');
  // Ask for barcode scope first (Premier Free); fall back to basic-only.
  for (const scope of ['basic barcode', 'basic']) {
    try {
      const res = await fetch(FS_TOKEN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      if (!d.access_token) continue;
      fsToken = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 86400) * 1000 };
      return fsToken.token;
    } catch { /* try next scope */ }
  }
  return null;
}

async function fsApi(params) {
  const token = await fsGetToken();
  if (!token) return null;
  const url = `${FS_API_URL}?${new URLSearchParams({ ...params, format: 'json' })}`;
  const hit = offCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.error) return null;
  offCache.set(url, { at: Date.now(), data });
  return data;
}

/** Text search via FatSecret. */
async function fsSearch(q) {
  const res = await fsApi({ method: 'foods.search', search_expression: q, max_results: '10' });
  let foods = res?.foods?.food ?? [];
  if (!Array.isArray(foods)) foods = [foods]; // single result comes unwrapped
  return foods
    .filter((f) => f?.food_name)
    .map((f) => ({
      name: f.food_name,
      brand: f.brand_name ?? null,
      image_url: null, // images are Premier-only on search
      barcode: null,
    }));
}

/** Barcode → product via FatSecret (needs the barcode scope / Premier Free). */
async function fsBarcodeLookup(barcode) {
  // FatSecret expects GTIN-13 — left-pad shorter UPC/EAN-8 codes.
  const gtin = barcode.padStart(13, '0');
  const idRes = await fsApi({ method: 'food.find_id_for_barcode', barcode: gtin });
  const foodId = idRes?.food_id?.value;
  if (!foodId || foodId === '0') return null;
  const foodRes = await fsApi({ method: 'food.get.v4', food_id: foodId });
  const food = foodRes?.food;
  if (!food?.food_name) return null;
  return {
    name: food.food_name,
    brand: food.brand_name ?? null,
    image_url: food.food_images?.food_image?.[0]?.image_url ?? null,
    barcode,
  };
}

const shapeItem = (r) => ({
  id: r.id,
  name: r.name,
  qty: r.qty,
  image_url: r.image_url,
  barcode: r.barcode,
  checked: r.checked,
  added_by: r.added_by,
  trip_id: r.trip_id ?? null,
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

    const tripId = Number.isInteger(req.body?.trip_id) ? req.body.trip_id : null;

    const { rows } = await query(
      `INSERT INTO shopping_items (name, qty, image_url, barcode, added_by, trip_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, qty, imageUrl, barcode, accountId, tripId],
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

  // POST /api/shopping/clear-checked — sweep ticked items off the given trip
  // (trip_id null = the General list).
  fastify.post('/api/shopping/clear-checked', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const tripId = Number.isInteger(req.body?.trip_id) ? req.body.trip_id : null;
    await query(
      `DELETE FROM shopping_items WHERE checked = TRUE AND trip_id IS NOT DISTINCT FROM $1`,
      [tripId],
    );
    return { ok: true };
  });

  // ── Trips ───────────────────────────────────────────────────────────────────

  // GET /api/shopping/trips
  fastify.get('/api/shopping/trips', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(`SELECT * FROM shopping_trips ORDER BY created_at`);
    return { trips: rows };
  });

  // POST /api/shopping/trips — create a trip.
  fastify.post('/api/shopping/trips', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 60);
    if (!name) return reply.code(400).send({ error: 'Name required' });
    const { rows } = await query(
      `INSERT INTO shopping_trips (name) VALUES ($1) RETURNING *`,
      [name],
    );
    return rows[0];
  });

  // PATCH /api/shopping/trips/:id — rename.
  fastify.patch('/api/shopping/trips/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    const name = (req.body?.name ?? '').toString().trim().slice(0, 60);
    if (!Number.isInteger(id) || !name) return reply.code(400).send({ error: 'Bad request' });
    const { rows } = await query(
      `UPDATE shopping_trips SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id],
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Trip not found' });
    return rows[0];
  });

  // DELETE /api/shopping/trips/:id — items fall back to General (FK SET NULL).
  fastify.delete('/api/shopping/trips/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    await query(`DELETE FROM shopping_trips WHERE id = $1`, [id]);
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
    // FatSecret ONLY — errors are surfaced so a misconfigured key/IP
    // allow-list is visible in the UI rather than silently empty.
    if (!fsEnabled()) return { products: [], error: 'FatSecret not configured (.env)' };
    try {
      const token = await fsGetToken();
      if (!token) return { products: [], error: 'FatSecret auth failed — check credentials / IP allow-list' };
      const products = await fsSearch(q);
      return { products };
    } catch (err) {
      req.log.warn({ err }, 'FatSecret search failed');
      return { products: [], error: 'FatSecret search failed' };
    }
  });

  // GET /api/shopping/off-product/:barcode — barcode lookup via FatSecret
  // (requires the barcode scope — Premier Free approval).
  fastify.get('/api/shopping/off-product/:barcode', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const barcode = (req.params.barcode ?? '').toString().replace(/\D/g, '').slice(0, 20);
    if (!barcode) return reply.code(400).send({ error: 'Bad barcode' });
    if (!fsEnabled()) return { found: false, barcode, error: 'FatSecret not configured (.env)' };
    try {
      const product = await fsBarcodeLookup(barcode);
      if (product) return { found: true, product };
    } catch (err) {
      req.log.warn({ err }, 'FatSecret barcode lookup failed');
      return { found: false, barcode, error: 'FatSecret barcode lookup failed' };
    }
    return { found: false, barcode };
  });
}
