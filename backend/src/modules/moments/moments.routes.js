import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { sendPush } from '../notifications/push.js';
import { query } from '../../db.js';
import {
  listMoments,
  getMoment,
  createMoment,
  updateMoment,
  promoteMoment,
  deleteMoment,
  addMedia,
  removeMedia,
} from './moments.repo.js';

async function getSenderName(accountId) {
  try {
    const { rows } = await query(`SELECT name FROM accounts WHERE id = $1`, [accountId]);
    return rows[0]?.name ?? 'Someone';
  } catch { return 'Someone'; }
}

async function notifyPartner(actorId, action) {
  try {
    const [other, name] = await Promise.all([findOtherUser(actorId), getSenderName(actorId)]);
    if (!other) return;
    await sendPush(other.id, {
      title: `${name} just ${action} a sneaky moment`,
      body: 'Best go take a look, ey?',
      url: '/moments',
      tag: 'sneaky-moment',
    });
  } catch { /* never bubble */ }
}

export async function momentsRoutes(fastify) {
  // GET /api/moments — returns { moments, partner }
  fastify.get('/api/moments', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const [moments, partner] = await Promise.all([
      listMoments(accountId),
      findOtherUser(accountId).catch(() => null),
    ]);
    return { moments, partner: partner ? { id: partner.id, name: partner.name } : null };
  });

  // POST /api/moments  { type: 'personal'|'shared' }
  fastify.post('/api/moments', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const type = req.body?.type === 'shared' ? 'shared' : 'personal';
    const moment = await createMoment(accountId, type);
    if (type === 'shared') notifyPartner(accountId, 'shared');
    return reply.code(201).send(moment);
  });

  // GET /api/moments/:id
  fastify.get('/api/moments/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const moment = await getMoment(req.params.id, accountId);
    if (!moment) return reply.code(404).send({ error: 'Not found' });
    return moment;
  });

  // PATCH /api/moments/:id  { location?, body?, tags? }
  fastify.patch('/api/moments/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { location, body, tags } = req.body ?? {};
    try {
      const updated = await updateMoment(req.params.id, accountId, { location, body, tags });
      if (!updated) return reply.code(404).send({ error: 'Not found or not yours' });
      return updated;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // PATCH /api/moments/:id/promote
  fastify.patch('/api/moments/:id/promote', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      const updated = await promoteMoment(req.params.id, accountId);
      if (!updated) return reply.code(404).send({ error: 'Not found or already shared' });
      notifyPartner(accountId, 'shared');
      return updated;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // DELETE /api/moments/:id
  fastify.delete('/api/moments/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      const ok = await deleteMoment(req.params.id, accountId);
      if (!ok) return reply.code(404).send({ error: 'Not found or not yours' });
      return { ok: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // POST /api/moments/:id/media  { url, type }
  fastify.post('/api/moments/:id/media', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { url, type } = req.body ?? {};
    if (!url || !['image', 'voice'].includes(type)) {
      return reply.code(400).send({ error: 'url and type (image|voice) required' });
    }
    try {
      const media = await addMedia(req.params.id, accountId, { url, type });
      if (!media) return reply.code(404).send({ error: 'Moment not found or not yours' });
      return reply.code(201).send(media);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // DELETE /api/moments/:id/media/:mediaId
  fastify.delete('/api/moments/:id/media/:mediaId', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    try {
      const ok = await removeMedia(req.params.id, req.params.mediaId, accountId);
      if (!ok) return reply.code(404).send({ error: 'Not found or not yours' });
      return { ok: true };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
