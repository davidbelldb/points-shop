import {
  listActive, listArchive, getStory, createStory, deleteStory,
} from './stories.repo.js';
import {
  listReels, getReel, getReelOwner, createReel, updateReel, deleteReel,
  addStoryToReel, removeStoryFromReel,
} from './reels.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

// Mutation gate — only the reel's creator can rename / delete / add / remove.
async function assertReelOwner(reelId, accountId, reply) {
  const owner = await getReelOwner(reelId);
  if (owner == null) { reply.code(404).send({ error: 'not found' }); return false; }
  if (owner !== accountId) { reply.code(403).send({ error: "not your reel" }); return false; }
  return true;
}

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

  /* ----- Highlight reels -----
     Reels are per-account. By default GET /api/reels returns only the
     caller's own reels (used by /stories and the Save-to-highlight modal).
     The home strip passes ?scope=all to see published reels from both
     participants. Mutation routes always require ownership of the reel. */
  fastify.get('/api/reels', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const scope = String(req.query?.scope ?? 'mine').toLowerCase();
    if (scope === 'all') return listReels(null);
    return listReels(accountId);
  });

  // Read-only — accessible to either user. Lets the home strip fetch the
  // other person's reel stories to play them in the viewer.
  fastify.get('/api/reels/:id', async (req, reply) => {
    const r = await getReel(req.params.id);
    if (!r) return reply.code(404).send({ error: 'not found' });
    return r;
  });

  fastify.post('/api/reels', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      return reply.code(201).send(await createReel(accountId, req.body ?? {}));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.patch('/api/reels/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await assertReelOwner(req.params.id, accountId, reply))) return;
    try {
      const r = await updateReel(req.params.id, req.body ?? {});
      if (!r) return reply.code(404).send({ error: 'not found' });
      return r;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/reels/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await assertReelOwner(req.params.id, accountId, reply))) return;
    await deleteReel(req.params.id);
    return { ok: true };
  });

  fastify.post('/api/reels/:id/stories', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await assertReelOwner(req.params.id, accountId, reply))) return;
    const { story_id } = req.body ?? {};
    if (!story_id) return reply.code(400).send({ error: 'story_id required' });
    await addStoryToReel(req.params.id, story_id);
    return { ok: true };
  });

  fastify.delete('/api/reels/:id/stories/:storyId', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!(await assertReelOwner(req.params.id, accountId, reply))) return;
    await removeStoryFromReel(req.params.id, req.params.storyId);
    return { ok: true };
  });
}
