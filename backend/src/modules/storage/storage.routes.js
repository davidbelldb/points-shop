import { listVideoUploads, deleteVideoUploads, MIN_AGE_DAYS } from './storage.repo.js';

function requireAdmin(req, reply) {
  if (req.user?.actualRole !== 'admin') {
    reply.code(403).send({ error: 'forbidden' });
    return false;
  }
  return true;
}

/* Disk data hygiene — backs the /admin/storage dashboard. Admin-only
   (matched by Caddy's @admin basicauth on /api/admin/* AND enforced again
   here via requireAdmin, same belt-and-braces pattern as timeline.routes.js
   and stb15.routes.js). */
export default async function storageRoutes(fastify) {
  fastify.get('/api/admin/storage/reels', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const items = await listVideoUploads();
    return { items, min_age_days: MIN_AGE_DAYS };
  });

  fastify.post('/api/admin/storage/reels/cleanup', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((x) => typeof x === 'string' && x)
      : [];
    if (ids.length === 0) return reply.code(400).send({ error: 'ids required' });
    return deleteVideoUploads(ids);
  });
}
