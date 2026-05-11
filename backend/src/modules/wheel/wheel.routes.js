import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  getActiveWheel, listSegments, insertSegment, updateSegmentById, deleteSegmentById, recordSpin,
} from './wheel.repo.js';

async function getBalance(accountId) {
  const r = await query(`SELECT points_balance FROM accounts WHERE id = $1`, [accountId]);
  return r.rows[0]?.points_balance ?? 0;
}
function isAdmin(req) { return req.user?.actualRole === 'admin'; }

export default async function wheelRoutes(fastify) {
  fastify.get('/api/wheels/active', async () => {
    const wheel = await getActiveWheel();
    if (!wheel) return { wheel: null, segments: [] };
    const segments = await listSegments(wheel.id);
    return { wheel, segments };
  });

  fastify.post('/api/wheels/:id/spin', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const wheel = await getActiveWheel();
    if (!wheel || wheel.id !== req.params.id) return reply.code(404).send({ error: 'Wheel not found' });
    const segments = await listSegments(wheel.id);
    if (segments.length < 2) return reply.code(400).send({ error: 'Wheel needs at least 2 segments' });
    const idx = Math.floor(Math.random() * segments.length);
    const seg = segments[idx];
    let summary = seg.label;
    if (seg.award_type === 'product' && seg.product_id) {
      await query(
        `INSERT INTO game_rewards (account_id, source_type, source_id, product_id)
         VALUES ($1, 'wheel-of-misfortune', $2, $3)`,
        [meId, seg.id, seg.product_id],
      );
      summary = `Won product: ${seg.product_name || seg.label}`;
    } else if (seg.award_type === 'points' && Number.isInteger(seg.points_delta) && seg.points_delta !== 0) {
      const balance = await getBalance(meId);
      const delta = Math.max(-balance, seg.points_delta);
      if (delta !== 0) {
        await query(
          `UPDATE accounts SET points_balance = points_balance + $1, updated_at = NOW() WHERE id = $2`,
          [delta, meId],
        );
        await query(
          `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
          [meId, delta, `wheel-of-misfortune:spin-${seg.id}`],
        );
      }
      summary = `${delta > 0 ? '+' : ''}${delta} pts`;
    } else if (seg.award_type === 'forfeit' && seg.forfeit_text) {
      await query(
        `INSERT INTO game_rewards (account_id, source_type, source_id, text_label)
         VALUES ($1, 'wheel-of-misfortune', $2, $3)`,
        [meId, seg.id, seg.forfeit_text],
      );
      summary = `Forfeit: ${seg.forfeit_text}`;
    }
    await recordSpin(wheel.id, meId, seg.id, summary);
    const newBalance = await getBalance(meId);
    return {
      segment_index: idx,
      segment: {
        id: seg.id, label: seg.label, color: seg.color, award_type: seg.award_type,
        product_name: seg.product_name, product_thumbnail: seg.product_thumbnail,
        forfeit_text: seg.forfeit_text, points_delta: seg.points_delta,
      },
      award_summary: summary,
      new_balance: newBalance,
    };
  });

  fastify.get('/api/admin/wheel', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const wheel = await getActiveWheel();
    if (!wheel) return { wheel: null, segments: [] };
    const segments = await listSegments(wheel.id);
    return { wheel, segments };
  });

  fastify.post('/api/admin/wheel/segments', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const wheel = await getActiveWheel();
    if (!wheel) return reply.code(404).send({ error: 'No wheel' });
    return await insertSegment(wheel.id, req.body ?? {});
  });

  fastify.patch('/api/admin/wheel/segments/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const updated = await updateSegmentById(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Segment not found' });
    return updated;
  });

  fastify.delete('/api/admin/wheel/segments/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    await deleteSegmentById(req.params.id);
    return { ok: true };
  });
}
