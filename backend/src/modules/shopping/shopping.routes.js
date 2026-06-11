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
const shapeTrip = (r) => ({ id: r.id, name: r.name, trip_date: ymd(r.trip_date), event_id: r.event_id ?? null, created_at: r.created_at });

/**
 * Trip → event mirror: write the linked trip's current item names back into
 * the calendar event's snack_list. Called after any item change on a linked
 * trip. Direct SQL — never routes back through the calendar API, so there's
 * no sync recursion.
 */
async function mirrorTripToEvent(tripId) {
  if (!tripId) return;
  const trip = (await query(`SELECT id, event_id FROM shopping_trips WHERE id = $1`, [tripId])).rows[0];
  if (!trip?.event_id) return;
  const { rows } = await query(
    `SELECT name FROM shopping_items WHERE trip_id = $1 ORDER BY created_at`,
    [tripId],
  );
  await query(
    `UPDATE calendar_events SET snack_list = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(rows.map((r) => r.name)), trip.event_id],
  ).catch(() => {});
}

// External product APIs are retired — the hand-curated house grocery
// catalogue (managed via /admin) is the product source now.

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
 * Event → trip sync. Exported — the calendar module calls this after every
 * event create/update; the from-event endpoint calls it on demand.
 *
 * Linking rules:
 * - A trip already linked (event_id) is the event's mirror: reconcile fully —
 *   add new snacks, REMOVE items no longer in the snack list (checked items
 *   that survive stay checked).
 * - First contact (matched by tripId param or by date, not yet linked):
 *   link it, then UNION — add the event's snacks as items AND mirror the
 *   trip's pre-existing items back into the event, so nothing is lost.
 * - No trip + snacks exist → create one named after the event, linked.
 * - No snacks at all and no linked trip → no-op (lists only appear once
 *   snacks are added).
 */
export async function syncEventSnacks(event, accountId, tripId = null) {
  const snacks = (Array.isArray(event.snack_list) ? event.snack_list : [])
    .map((s) => String(s ?? '').trim()).filter(Boolean);

  const tripDate = new Date(event.starts_at).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  // Resolve the trip: explicit → linked → same-date → create
  let trip = null;
  let firstLink = false;
  if (tripId) {
    trip = (await query(`SELECT * FROM shopping_trips WHERE id = $1`, [tripId])).rows[0] ?? null;
  }
  if (!trip) {
    trip = (await query(`SELECT * FROM shopping_trips WHERE event_id = $1 LIMIT 1`, [event.id])).rows[0] ?? null;
  }
  if (!trip) {
    trip = (await query(
      `SELECT * FROM shopping_trips WHERE trip_date = $1 AND event_id IS NULL ORDER BY created_at LIMIT 1`,
      [tripDate],
    )).rows[0] ?? null;
    if (trip) firstLink = true;
  }
  if (!trip) {
    if (!snacks.length) return { trip: null, added: 0, skipped: 0 };
    trip = (await query(
      `INSERT INTO shopping_trips (name, trip_date, event_id) VALUES ($1, $2, $3) RETURNING *`,
      [(event.title ?? 'Shop').slice(0, 60), tripDate, event.id],
    )).rows[0];
  } else if (!trip.event_id || trip.event_id !== event.id) {
    firstLink = firstLink || !trip.event_id;
    await query(`UPDATE shopping_trips SET event_id = $1 WHERE id = $2`, [event.id, trip.id]);
    trip = { ...trip, event_id: event.id };
  }

  const existingRows = (await query(
    `SELECT id, lower(name) AS n FROM shopping_items WHERE trip_id = $1`,
    [trip.id],
  )).rows;
  const existing = new Set(existingRows.map((r) => r.n));
  const snackSet = new Set(snacks.map((s) => s.toLowerCase()));

  // Add snacks missing from the trip
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

  if (firstLink) {
    // Union on first contact: fold the trip's pre-existing items back into
    // the event's snack list rather than deleting anything.
    await mirrorTripToEvent(trip.id);
  } else {
    // Established mirror: items removed from the event come off the trip too.
    const toDelete = existingRows.filter((r) => !snackSet.has(r.n)).map((r) => r.id);
    if (toDelete.length) {
      await query(`DELETE FROM shopping_items WHERE id = ANY($1::int[])`, [toDelete]);
    }
  }

  return { trip: shapeTrip(trip), added, skipped: snacks.length - added };
}

/**
 * One-shot backfill, run at server startup: sync every upcoming event that
 * already has snacks. Brings pre-existing events (created before the
 * bi-directional sync shipped) into the fold. Idempotent — linked pairs
 * mirror each other, so repeat runs are no-ops.
 */
export async function backfillEventSnackSync() {
  const { rows: events } = await query(
    `SELECT * FROM calendar_events
      WHERE COALESCE(ends_at, starts_at) >= NOW()
        AND jsonb_array_length(snack_list) > 0`,
  );
  for (const ev of events) {
    try {
      await syncEventSnacks(ev, ev.created_by ?? null);
    } catch { /* keep going — one bad event shouldn't block the rest */ }
  }
  return events.length;
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
    await mirrorTripToEvent(tripId); // linked trip → event snack list follows
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
    const item = (await query(`SELECT trip_id FROM shopping_items WHERE id = $1`, [id])).rows[0];
    await query(`DELETE FROM shopping_items WHERE id = $1`, [id]);
    await mirrorTripToEvent(item?.trip_id ?? null); // linked trip → event follows
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
    await mirrorTripToEvent(tripId); // bought + cleared = off the event list too
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

  // ── House grocery catalogue ─────────────────────────────────────────────────

  const shapeGrocery = (r) => ({
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    barcode: r.barcode,
    barcode_image_url: r.barcode_image_url,
  });

  // GET /api/shopping/groceries?q= — all (admin) or matches on type.
  fastify.get('/api/shopping/groceries', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const q = (req.query?.q ?? '').toString().trim().toLowerCase().slice(0, 60);
    const { rows } = q
      ? await query(
          `SELECT * FROM groceries WHERE lower(name) LIKE '%' || $1 || '%' ORDER BY name LIMIT 8`,
          [q],
        )
      : await query(`SELECT * FROM groceries ORDER BY name`);
    return { groceries: rows.map(shapeGrocery) };
  });

  // POST /api/shopping/groceries — add to the catalogue.
  fastify.post('/api/shopping/groceries', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 120);
    if (!name) return reply.code(400).send({ error: 'Name required' });
    const barcode = (req.body?.barcode ?? '').toString().replace(/\D/g, '').slice(0, 20) || null;
    try {
      const { rows } = await query(
        `INSERT INTO groceries (name, image_url, barcode, barcode_image_url)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, req.body?.image_url || null, barcode, req.body?.barcode_image_url || null],
      );
      return shapeGrocery(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(400).send({ error: 'That barcode is already on another grocery' });
      throw err;
    }
  });

  // PATCH /api/shopping/groceries/:id
  fastify.patch('/api/shopping/groceries/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    const fields = [];
    const values = [];
    let i = 1;
    const { name, image_url, barcode, barcode_image_url } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) { fields.push(`name = $${i++}`); values.push(name.trim().slice(0, 120)); }
    if (image_url !== undefined) { fields.push(`image_url = $${i++}`); values.push(image_url || null); }
    if (barcode !== undefined) { fields.push(`barcode = $${i++}`); values.push(String(barcode ?? '').replace(/\D/g, '').slice(0, 20) || null); }
    if (barcode_image_url !== undefined) { fields.push(`barcode_image_url = $${i++}`); values.push(barcode_image_url || null); }
    if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
    fields.push('updated_at = NOW()');
    values.push(id);
    try {
      const { rows } = await query(
        `UPDATE groceries SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values,
      );
      if (!rows[0]) return reply.code(404).send({ error: 'Grocery not found' });
      return shapeGrocery(rows[0]);
    } catch (err) {
      if (err.code === '23505') return reply.code(400).send({ error: 'That barcode is already on another grocery' });
      throw err;
    }
  });

  // DELETE /api/shopping/groceries/:id
  fastify.delete('/api/shopping/groceries/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    await query(`DELETE FROM groceries WHERE id = $1`, [id]);
    return { ok: true };
  });

  // GET /api/shopping/off-product/:barcode — barcode lookup against the
  // house grocery catalogue only (external APIs retired).
  fastify.get('/api/shopping/off-product/:barcode', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const barcode = (req.params.barcode ?? '').toString().replace(/\D/g, '').slice(0, 20);
    if (!barcode) return reply.code(400).send({ error: 'Bad barcode' });

    const mine = (await query(`SELECT * FROM groceries WHERE barcode = $1 LIMIT 1`, [barcode])).rows[0];
    if (mine) {
      return { found: true, product: { name: mine.name, image_url: mine.image_url, barcode } };
    }
    return { found: false, barcode };
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

}
