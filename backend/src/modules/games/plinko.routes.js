/**
 * Plinko — backend routes
 *
 * GET  /api/games/plinko/config          → cost, peg rows, slots (+ prize labels), balance
 * POST /api/games/plinko/drop            → SERVER-AUTHORITATIVE: atomically debit the
 *                                            stake, pick the landing slot (weighted), and
 *                                            award its prize into game_rewards. Returns the
 *                                            slot index so the client can animate the ball
 *                                            landing there — the physics never decides the
 *                                            outcome, so it can't be tampered with.
 * GET  /api/games/plinko/admin           → full settings + slots (admin only)
 * PUT  /api/games/plinko/admin/settings  → { cost_per_play, peg_rows } (admin only)
 * PUT  /api/games/plinko/admin/slots     → replace all slot prize config (admin only)
 *
 * Prizes (phase 1): 'product' (game_rewards.product_id) and 'experience'
 * (game_rewards.text_label). 'none' = a blank slot (stake spent, no prize).
 */

import { query, pool } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

const PRIZE_KINDS = new Set(['none', 'product', 'experience']);

async function isAdmin(accountId) {
  const r = await query(`SELECT role FROM accounts WHERE id = $1`, [accountId]);
  return (r.rows[0]?.role || '') === 'admin';
}

async function getSettings() {
  const r = await query(`SELECT cost_per_play, peg_rows FROM plinko_settings WHERE id = 1`);
  return { cost_per_play: r.rows[0]?.cost_per_play ?? 100, peg_rows: r.rows[0]?.peg_rows ?? 12 };
}

// Full slot array of length (peg_rows + 1), merging configured rows over blanks
// so the board always has a slot per landing column. Includes product details
// for display.
async function loadSlots(slotCount) {
  const { rows } = await query(
    `SELECT s.id, s.slot_index, s.prize_kind, s.product_id, s.text_label, s.label, s.weight,
            p.name AS product_name, p.thumbnail_url AS product_thumbnail
       FROM plinko_slots s
       LEFT JOIN products p ON p.id = s.product_id
      ORDER BY s.slot_index ASC`,
  );
  const byIndex = new Map(rows.map(r => [r.slot_index, r]));
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const r = byIndex.get(i);
    slots.push(r
      ? {
          id: r.id, slot_index: i, prize_kind: r.prize_kind,
          product_id: r.product_id, text_label: r.text_label,
          label: r.label, weight: Number(r.weight) || 0,
          product_name: r.product_name, product_thumbnail: r.product_thumbnail,
        }
      : { id: null, slot_index: i, prize_kind: 'none', product_id: null, text_label: null, label: null, weight: 1, product_name: null, product_thumbnail: null });
  }
  return slots;
}

// Public shape of a slot — never leaks anything the player shouldn't see; the
// prize on offer per slot is intentionally visible so they know what's at stake.
function publicSlot(s) {
  return {
    slot_index: s.slot_index,
    prize_kind: s.prize_kind,
    label: s.label
      ?? (s.prize_kind === 'product' ? (s.product_name ?? 'Prize')
        : s.prize_kind === 'experience' ? (s.text_label ?? 'Experience')
        : ''),
    product: s.prize_kind === 'product' && s.product_id
      ? { name: s.product_name, thumbnail_url: s.product_thumbnail } : null,
    text_label: s.prize_kind === 'experience' ? s.text_label : null,
  };
}

// Weighted random pick across all slots (0-weight slots can't be landed).
function pickSlot(slots) {
  const total = slots.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total <= 0) return slots[Math.floor(Math.random() * slots.length)];
  let r = Math.random() * total;
  for (const s of slots) {
    r -= Math.max(0, s.weight);
    if (r < 0) return s;
  }
  return slots[slots.length - 1];
}

export default async function plinkoRoutes(fastify) {

  // ── Player: board config + balance ──────────────────────────────────────
  fastify.get('/api/games/plinko/config', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const { cost_per_play, peg_rows } = await getSettings();
    const slotCount = peg_rows + 1;
    const slots = await loadSlots(slotCount);
    const balRow = await query(`SELECT points_balance FROM accounts WHERE id = $1`, [accountId]);
    return {
      cost_per_play,
      peg_rows,
      slot_count: slotCount,
      slots: slots.map(publicSlot),
      balance: balRow.rows[0]?.points_balance ?? 0,
    };
  });

  // ── Player: drop a chip (atomic, server-authoritative) ──────────────────
  fastify.post('/api/games/plinko/drop', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { cost_per_play, peg_rows } = await getSettings();
    const slotCount = peg_rows + 1;
    const slots = await loadSlots(slotCount);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the balance row so two rapid drops can't both spend the same points.
      const balRes = await client.query(
        `SELECT points_balance FROM accounts WHERE id = $1 FOR UPDATE`, [accountId],
      );
      const balance = balRes.rows[0]?.points_balance ?? 0;
      if (balance < cost_per_play) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Not enough points', balance });
      }

      // Debit the stake.
      await client.query(
        `UPDATE accounts SET points_balance = points_balance - $1, updated_at = NOW() WHERE id = $2`,
        [cost_per_play, accountId],
      );
      await client.query(
        `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
        [accountId, -cost_per_play, 'plinko:play'],
      );

      // Decide the outcome here — never trust the client.
      const chosen = pickSlot(slots);

      // Award the slot's prize (if any) into the shared game-rewards flow.
      if (chosen.prize_kind === 'product' && chosen.product_id) {
        await client.query(
          `INSERT INTO game_rewards (account_id, source_type, source_id, product_id)
           VALUES ($1, 'plinko', $2, $3)`,
          [accountId, chosen.id, chosen.product_id],
        );
      } else if (chosen.prize_kind === 'experience' && chosen.text_label) {
        await client.query(
          `INSERT INTO game_rewards (account_id, source_type, source_id, text_label)
           VALUES ($1, 'plinko', $2, $3)`,
          [accountId, chosen.id, chosen.text_label],
        );
      }

      await client.query('COMMIT');
      return {
        slot_index: chosen.slot_index,
        prize: publicSlot(chosen),
        balance: balance - cost_per_play,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });

  // ── Admin: full config ──────────────────────────────────────────────────
  fastify.get('/api/games/plinko/admin', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await isAdmin(accountId))) return reply.code(403).send({ error: 'Admin only' });
    const { cost_per_play, peg_rows } = await getSettings();
    const slots = await loadSlots(peg_rows + 1);
    return { cost_per_play, peg_rows, slot_count: peg_rows + 1, slots };
  });

  fastify.put('/api/games/plinko/admin/settings', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await isAdmin(accountId))) return reply.code(403).send({ error: 'Admin only' });
    const cost = Number(req.body?.cost_per_play);
    const rows = Number(req.body?.peg_rows);
    if (!Number.isInteger(cost) || cost < 0) return reply.code(400).send({ error: 'cost_per_play must be a non-negative integer' });
    if (!Number.isInteger(rows) || rows < 4 || rows > 20) return reply.code(400).send({ error: 'peg_rows must be 4–20' });
    await query(
      `UPDATE plinko_settings SET cost_per_play = $1, peg_rows = $2, updated_at = NOW() WHERE id = 1`,
      [cost, rows],
    );
    return { ok: true };
  });

  // Replace the entire slot config in one shot.
  fastify.put('/api/games/plinko/admin/slots', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await isAdmin(accountId))) return reply.code(403).send({ error: 'Admin only' });
    const incoming = Array.isArray(req.body?.slots) ? req.body.slots : null;
    if (!incoming) return reply.code(400).send({ error: 'slots array required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM plinko_slots`);
      for (const s of incoming) {
        const kind = PRIZE_KINDS.has(s.prize_kind) ? s.prize_kind : 'none';
        const idx = Number(s.slot_index);
        if (!Number.isInteger(idx) || idx < 0) continue;
        await client.query(
          `INSERT INTO plinko_slots (slot_index, prize_kind, product_id, text_label, label, weight)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (slot_index) DO UPDATE SET
             prize_kind = EXCLUDED.prize_kind, product_id = EXCLUDED.product_id,
             text_label = EXCLUDED.text_label, label = EXCLUDED.label,
             weight = EXCLUDED.weight, updated_at = NOW()`,
          [
            idx, kind,
            kind === 'product' ? (s.product_id || null) : null,
            kind === 'experience' ? (s.text_label || null) : null,
            s.label || null,
            Number.isInteger(Number(s.weight)) && Number(s.weight) >= 0 ? Number(s.weight) : 1,
          ],
        );
      }
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  });
}
