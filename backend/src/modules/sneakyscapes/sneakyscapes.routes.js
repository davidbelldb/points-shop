import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { getGarden, saveGarden } from './sneakyscapes.repo.js';

export default async function sneakyscapesRoutes(fastify) {
  // GET /api/sneakyscapes — the shared garden layout.
  fastify.get('/api/sneakyscapes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    return getGarden();
  });

  // PUT /api/sneakyscapes  { placements: [...] } — replace the whole layout.
  fastify.put('/api/sneakyscapes', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const placements = req.body?.placements;
    if (!Array.isArray(placements)) {
      return reply.code(400).send({ error: 'placements (array) required' });
    }
    if (placements.length > 5000) {
      return reply.code(400).send({ error: 'too many placements' });
    }
    return saveGarden(accountId, placements);
  });
}
