import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  getActiveWheel, updateWheel, listSegments,
  insertSegment, updateSegmentById, deleteSegmentById, recordSpin,
} from './wheel.repo.js';

async function getBalance(accountId) {
  const r = await query(`SELECT points_balance FROM accounts WHERE id = $1`, [accountId]);
  return r.rows[0]?.points_balance ?? 0;
}
function isAdmin(req) { return req.user?.actualRole === 'admin'; }
function timeToHHMM(t) { if (!t) return null; return String(t).slice(0, 5); }
function shapeWheel(w) {
  if (!w) return null;
  return {
    ...w,
    homepage_start_time: timeToHHMM(w.homepage_start_time),
    homepage_end_time:   timeToHHMM(w.homepage_end_time),
  };
}

export default async function wheelRoutes(fastify) {
  fastify.get('/api/wheels/active', async () => {
    const wheel = await getActiveWheel();
    if (!wheel) return { wheel: null, segments: [] };
    const segments = await listSegments(wheel.id);
    return { wheel: shapeWheel(wheel), segments };
  });

  fastify.get('/api/wheels/homepage', async () => {
    const wheel = await getActiveWheel();
    if (!wheel || !wheel.homepage_visible) return { wheel: null, segments: [] };
    const segments = await listSegments(wheel.id);
    if (segments.length < 2) return { wheel: null, segments: [] };
    return { wheel: shapeWheel(wheel), segments };
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
      summary = `Won: ${seg.product_name || seg.label}`;
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
    return { wheel: shapeWheel(wheel), segments };
  });

  fastify.patch('/api/admin/wheel', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const wheel = await getActiveWheel();
    if (!wheel) return reply.code(404).send({ error: 'No wheel' });
    const body = req.body ?? {};
    const patch = {};
    if ('spin_label' in body)          patch.spin_label = body.spin_label || null;
    if ('peg_color' in body)           patch.peg_color = body.peg_color || null;
    if ('homepage_visible' in body)    patch.homepage_visible = !!body.homepage_visible;
    if ('homepage_title' in body)      patch.homepage_title = body.homepage_title || null;
    if ('homepage_subtitle' in body)   patch.homepage_subtitle = body.homepage_subtitle || null;
    if ('homepage_days' in body)       patch.homepage_days = Array.isArray(body.homepage_days) ? body.homepage_days : [];
    if ('homepage_start_time' in body) patch.homepage_start_time = body.homepage_start_time || null;
    if ('homepage_end_time' in body)   patch.homepage_end_time   = body.homepage_end_time   || null;
    if ('name' in body)                patch.name = body.name;
    await updateWheel(wheel.id, patch);
    return shapeWheel(await getActiveWheel());
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
