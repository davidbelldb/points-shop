import {
  listActive, listArchive, getStory, createStory, deleteStory,
} from './stories.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

export default async function storiesRoutes(fastify) {
  /* Active stories — 24-hour live feed. Both authors' rows, newest first. */
  fastify.get('/api/stories/active', async () => listActive());

  /* Archive — expired stories. Optional from/to (ISO) for per-month windows. */
  fastify.get('/api/stories/archive', async (req) => {
    const { from, to } = req.query ?? {};
    return listArchive(from ? String(from) : null, to ? String(to) : null);
  });

  fastify.get('/api/stories/:id', async (req, reply) => {
    const s = await getStory(req.params.id);
    if (!s) return reply.code(404).send({ error: 'not found' });
    return s;
  });

  /* Create — caller has already uploaded the media via /api/admin/upload and
     hands us back the URL + type. Author = effective account. */
  fastify.post('/api/stories', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      return reply.code(201).send(await createStory(accountId, req.body ?? {}));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/stories/:id', async (req) => {
    const accountId = getEffectiveAccountId(req);
    await deleteStory(req.params.id, accountId);
    return { ok: true };
  });
}
