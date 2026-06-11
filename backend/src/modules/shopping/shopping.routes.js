/**
 * Sneaky shopping list — shared list + Open Food Facts proxy.
 *
 * OFF requests go through the backend so we can set a proper User-Agent
 * (per OFF API etiquette), sidestep CORS, and cache responses — the
 * household doesn't need to hammer a volunteer-run service.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';
import { getEvent } from '../calendar/calendar.repo.js';

// DATE columns come back from pg as JS Date objects — normalise to
// 'YYYY-MM-DD' so the frontend never sees an ISO timestamp (the cause of
// the "INVALID DATE" header bug).
const ymd = (d) => {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toLocaleDateString('en-CA');
};
const shapeTrip = (r) => ({ id: r.id, name: r.name, trip_date: ymd(r.trip_date), created_at: r.created_at });

// ── Open Food Facts — UK catalogue, popularity-sorted ─────────────────────────
// Product-centric (real shelf items with barcodes + photos), unlike nutrition
// APIs which return generic foods/meals. uk.openfoodfacts.org scopes results
// to products sold in the UK; sort_by=unique_scans_n floats popular products.
const OFF_BASE = 'https://uk.openfoodfacts.org';
const OFF_UA = 'SneakyPoints/1.0 (private household app)';
const OFF_FIELDS = 'product_name,image_small_url,code';

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

/** UK product search — popularity-sorted so well-known products come first.
    Brand/shop names are not sent to the frontend (clean names only). */
async function offSearch(q) {
  const url = `${OFF_BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
    `&search_simple=1&action=process&json=1&page_size=10` +
    `&sort_by=unique_scans_n&fields=${OFF_FIELDS}`;
  const data = await offFetch(url);
  return (data.products ?? [])
    .filter((p) => p?.product_name?.trim())
    .map((p) => ({
      name: p.product_name.trim(),
      image_url: p.image_small_url ?? null,
      barcode: p.code ?? null,
    }));
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

/**
 * Sync a calendar event's snack list onto the shopping list.
 * Exported — the calendar module calls this after every event create/update,
 * so lists auto-create the moment snacks exist and new snacks append later.
 *
 * - No snacks → no-op ({ trip: null }).
 * - Uses tripId when given; otherwise finds the trip on the event's date
 *   (UK time) or creates one named after the event.
 * - Skips snacks already on the trip (case-insensitive).
 */
export async function syncEventSnacks(event, accountId, tripId = null) {
  const snacks = (Array.isArray(event.snack_list) ? event.snack_list : [])
    .map((s) => String(s ?? '').trim()).filter(Boolean);
  if (!snacks.length) return { trip: null, added: 0, skipped: 0 };

  const tripDate = new Date(event.starts_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  let trip = null;
  if (tripId) {
    trip = (await query(`SELECT * FROM shopping_trips WHERE id = $1`, [tripId])).rows[0] ?? null;
  }
  if (!trip) {
    trip = (await query(
      `SELECT * FROM shopping_trips WHERE trip_date = $1 ORDER BY created_at LIMIT 1`,
      [tripDate],
    )).rows[0] ?? null;
  }
  if (!trip) {
    trip = (await query(
      `INSERT INTO shopping_trips (name, trip_date) VALUES ($1, $2) RETURNING *`,
      [(event.title ?? 'Shop').slice(0, 60), tripDate],
    )).rows[0];
  }

  const existing = new Set(
    (await query(`SELECT lower(name) AS n FROM shopping_items WHERE trip_id = $1`, [trip.id]))
      .rows.map((r) => r.n),
  );
  let added = 0;
  for (const snack of snacks) {
    if (existing.has(snack.toLowerCase())) continue;
    await query(
      `INSERT INTO shopping_items (name, added_by, trip_id) VALUES ($1, $2, $3)`,
      [snack.slice(0, 120), accountId, trip.id],
    );
    await bumpHistory(snack, null, null);
    existing.add(snack.toLowerCase());
    added++;
  }

  return { trip: shapeTrip(trip), added, skipped: snacks.length - added };
}

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
    return { trips: rows.map(shapeTrip) };
  });

  const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

  // POST /api/shopping/trips — create a trip (date required, name optional).
  fastify.post('/api/shopping/trips', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 60);
    const tripDate = (req.body?.trip_date ?? '').toString();
    if (!DATE_RX.test(tripDate)) return reply.code(400).send({ error: 'trip_date required (YYYY-MM-DD)' });
    const { rows } = await query(
      `INSERT INTO shopping_trips (name, trip_date) VALUES ($1, $2) RETURNING *`,
      [name || 'Shop', tripDate],
    );
    return shapeTrip(rows[0]);
  });

  // PATCH /api/shopping/trips/:id — rename and/or redate.
  fastify.patch('/api/shopping/trips/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    const fields = [];
    const values = [];
    let i = 1;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 60);
    const tripDate = (req.body?.trip_date ?? '').toString();
    if (name) { fields.push(`name = $${i++}`); values.push(name); }
    if (DATE_RX.test(tripDate)) { fields.push(`trip_date = $${i++}`); values.push(tripDate); }
    if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
    values.push(id);
    const { rows } = await query(
      `UPDATE shopping_trips SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Trip not found' });
    return shapeTrip(rows[0]);
  });

  // POST /api/shopping/from-event — pull a calendar event's snack list onto
  // the shopping list. Optional trip_id targets a specific trip (used when
  // a trip was just created from the event picker).
  fastify.post('/api/shopping/from-event', async (req, reply) => {
    const accountId = requireAuth(req, reply);
    if (!accountId) return;
    const eventId = req.body?.event_id;
    if (!eventId) return reply.code(400).send({ error: 'event_id required' });

    const event = await getEvent(eventId);
    if (!event) return reply.code(404).send({ error: 'Event not found' });

    const tripId = Number.isInteger(req.body?.trip_id) ? req.body.trip_id : null;
    return syncEventSnacks(event, accountId, tripId);
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
    try {
      const products = await offSearch(q);
      return { products };
    } catch (err) {
      req.log.warn({ err }, 'OFF search failed');
      return { products: [], error: 'Product search unavailable' };
    }
  });

}
