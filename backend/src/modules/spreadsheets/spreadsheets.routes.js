/**
 * Sneaky Spreadsheets — shared multi-tab workbook backing /sneakyspreadsheets.
 *
 * One workbook for the household: every tab is visible and editable by both
 * accounts (same trust model as shared notes). Saves are whole-tab,
 * last-write-wins — fine for two people who talk to each other.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { query } from '../../db.js';

const DEFAULT_COLUMNS = ['A', 'B', 'C', 'D', 'E'];
const DEFAULT_ROWS = 12;

const shape = (r) => ({
  id: r.id,
  name: r.name,
  position: r.position,
  columns: r.columns,
  data: r.data,
  updated_at: r.updated_at,
});

export default async function spreadsheetsRoutes(fastify) {
  const requireAuth = (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) {
      reply.code(401).send({ error: 'Not authenticated' });
      return null;
    }
    return accountId;
  };

  // GET /api/spreadsheets/tabs — full workbook, ordered.
  fastify.get('/api/spreadsheets/tabs', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { rows } = await query(
      `SELECT * FROM spreadsheet_tabs ORDER BY position, id`,
    );
    return { tabs: rows.map(shape) };
  });

  // POST /api/spreadsheets/tabs — add a tab.
  fastify.post('/api/spreadsheets/tabs', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const name = (req.body?.name ?? '').toString().trim().slice(0, 60) || 'Sheet';
    const emptyData = Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_COLUMNS.map(() => null));
    const { rows } = await query(
      `INSERT INTO spreadsheet_tabs (name, position, columns, data)
       VALUES ($1, COALESCE((SELECT MAX(position) + 1 FROM spreadsheet_tabs), 0), $2, $3)
       RETURNING *`,
      [name, JSON.stringify(DEFAULT_COLUMNS), JSON.stringify(emptyData)],
    );
    return shape(rows[0]);
  });

  // PATCH /api/spreadsheets/tabs/:id — rename / reorder / save contents.
  fastify.patch('/api/spreadsheets/tabs/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });

    const fields = [];
    const values = [];
    let i = 1;
    const { name, position, columns, data } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) {
      fields.push(`name = $${i++}`); values.push(name.trim().slice(0, 60));
    }
    if (Number.isInteger(position)) {
      fields.push(`position = $${i++}`); values.push(position);
    }
    if (Array.isArray(columns)) {
      fields.push(`columns = $${i++}`); values.push(JSON.stringify(columns.slice(0, 100)));
    }
    if (Array.isArray(data)) {
      fields.push(`data = $${i++}`); values.push(JSON.stringify(data));
    }
    if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });

    fields.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await query(
      `UPDATE spreadsheet_tabs SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values,
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Tab not found' });
    return shape(rows[0]);
  });

  // DELETE /api/spreadsheets/tabs/:id
  fastify.delete('/api/spreadsheets/tabs/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'Bad id' });
    await query(`DELETE FROM spreadsheet_tabs WHERE id = $1`, [id]);
    return { ok: true };
  });
}
