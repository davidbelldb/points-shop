import { query } from '../../db.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_COLOR = '#14b8a6';

/* Wheel of Entertainment — a "what shall we watch?" spinner. Its segments are
   the admin-curated titles (each with its own colour, like the Wheel of
   Misfortune), plus a synthesised "Bum Show" no-prize segment. Titles are
   typically chosen from the watchlist via the admin lookup. No points are
   awarded; the spin is purely a chooser. */
export default async function entertainmentRoutes(fastify) {
  fastify.get('/api/entertainment/wheel', async () => {
    const { rows } = await query(
      `SELECT label, color FROM entertainment_titles WHERE active = TRUE ORDER BY created_at ASC`,
    );
    return { titles: rows, bumShowLabel: 'Bum Show' };
  });

  // ---- Admin: title CRUD (admin is enforced globally for /api/admin/*) ----
  fastify.get('/api/admin/entertainment/titles', async () => {
    const { rows } = await query(
      `SELECT id, label, color, active, created_at FROM entertainment_titles ORDER BY created_at ASC`,
    );
    return rows;
  });

  // Lookup source for the admin "add title" picker: every distinct title on the
  // watchlist, regardless of the invite/shared flag.
  fastify.get('/api/admin/entertainment/watchlist-titles', async () => {
    const { rows } = await query(
      `SELECT DISTINCT ON (lower(title)) title
         FROM rewatch_items
        WHERE title IS NOT NULL AND length(trim(title)) > 0
        ORDER BY lower(title)`,
    );
    return rows.map((r) => r.title);
  });

  fastify.post('/api/admin/entertainment/titles', async (req, reply) => {
    const label = String(req.body?.label ?? '').trim();
    if (!label) return reply.code(400).send({ error: 'label required' });
    const color = HEX_RE.test(req.body?.color) ? req.body.color : DEFAULT_COLOR;
    const { rows } = await query(
      `INSERT INTO entertainment_titles (label, color) VALUES ($1, $2)
       RETURNING id, label, color, active, created_at`,
      [label, color],
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/api/admin/entertainment/titles/:id', async (req, reply) => {
    const patch = req.body ?? {};
    const updates = [];
    const values = [];
    if (typeof patch.label === 'string' && patch.label.trim()) {
      values.push(patch.label.trim()); updates.push(`label = $${values.length}`);
    }
    if (typeof patch.color === 'string') {
      if (!HEX_RE.test(patch.color)) return reply.code(400).send({ error: 'color must be a hex like #14b8a6' });
      values.push(patch.color); updates.push(`color = $${values.length}`);
    }
    if (typeof patch.active === 'boolean') {
      values.push(patch.active); updates.push(`active = $${values.length}`);
    }
    if (!updates.length) return reply.code(400).send({ error: 'nothing to update' });
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE entertainment_titles SET ${updates.join(', ')} WHERE id = $${values.length}
       RETURNING id, label, color, active, created_at`,
      values,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  fastify.delete('/api/admin/entertainment/titles/:id', async (req) => {
    await query(`DELETE FROM entertainment_titles WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });
}
