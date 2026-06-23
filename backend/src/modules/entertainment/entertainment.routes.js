import { query } from '../../db.js';

/* Wheel of Entertainment — a "what shall we watch?" spinner. Its titles are the
   invited (invite_david) unwatched rewatch-list entries, plus any manually
   curated titles from the admin section, plus a synthesised "Bum Show"
   no-prize segment. No points are awarded; the spin is purely a chooser. */
export default async function entertainmentRoutes(fastify) {
  fastify.get('/api/entertainment/wheel', async () => {
    const { rows: invited } = await query(
      `SELECT DISTINCT ON (lower(title)) title
         FROM rewatch_items
        WHERE invite_david = TRUE AND watched = FALSE
          AND title IS NOT NULL AND length(trim(title)) > 0
        ORDER BY lower(title)`,
    );
    const { rows: manual } = await query(
      `SELECT label FROM entertainment_titles WHERE active = TRUE ORDER BY created_at ASC`,
    );
    // Merge + case-insensitive dedupe, preserving order (invited first).
    const seen = new Set();
    const titles = [];
    for (const t of [...invited.map((r) => r.title), ...manual.map((r) => r.label)]) {
      const clean = (t ?? '').trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      titles.push(clean);
    }
    return { titles, bumShowLabel: 'Bum Show' };
  });

  // ---- Admin: manual title CRUD (admin is enforced globally for /api/admin/*) ----
  fastify.get('/api/admin/entertainment/titles', async () => {
    const { rows } = await query(
      `SELECT id, label, active, created_at FROM entertainment_titles ORDER BY created_at ASC`,
    );
    return rows;
  });

  fastify.post('/api/admin/entertainment/titles', async (req, reply) => {
    const label = String(req.body?.label ?? '').trim();
    if (!label) return reply.code(400).send({ error: 'label required' });
    const { rows } = await query(
      `INSERT INTO entertainment_titles (label) VALUES ($1)
       RETURNING id, label, active, created_at`,
      [label],
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.delete('/api/admin/entertainment/titles/:id', async (req) => {
    await query(`DELETE FROM entertainment_titles WHERE id = $1`, [req.params.id]);
    return { ok: true };
  });
}
