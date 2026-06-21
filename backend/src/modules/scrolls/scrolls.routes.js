import {
  getSettings, getFrames, updateSettings, replaceFrames,
  createScroll, listReceived, unreadCount, markRead, resolveDueScrolls,
} from './scrolls.repo.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';

// Background delivery resolver. A scroll only "arrives" once its crow has flown
// the distance; this timer flips due scrolls to delivered and fires the arrival
// push. listReceived also filters by deliver_at, so delivery is correct even if
// the timer is mid-cycle.
let resolverStarted = false;
function startResolver() {
  if (resolverStarted) return;
  resolverStarted = true;
  setInterval(() => { resolveDueScrolls().catch(() => {}); }, 15_000);
}

export default async function scrollRoutes(fastify) {
  startResolver();

  // ----- Config (read open, write admin-only) -----
  fastify.get('/api/scrolls/config', async () => {
    const [settings, frames] = await Promise.all([getSettings(), getFrames()]);
    return {
      settings,
      send: frames.filter((f) => f.layer === 'send'),
      land: frames.filter((f) => f.layer === 'land'),
    };
  });

  fastify.put('/api/scrolls/config/settings', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return updateSettings(req.body ?? {});
  });

  fastify.put('/api/scrolls/config/frames/:layer', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const { layer } = req.params;
    if (layer !== 'send' && layer !== 'land') {
      return reply.code(400).send({ error: 'layer must be send or land' });
    }
    const frames = Array.isArray(req.body?.frames) ? req.body.frames : [];
    return replaceFrames(layer, frames);
  });

  // ----- Scrolls -----
  // (Origin/destination geocoding is done client-side via Nominatim, reusing
  // the same pattern as the stories location sticker — no backend endpoint.)
  fastify.get('/api/scrolls', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const [received, unread] = await Promise.all([
      listReceived(accountId), unreadCount(accountId),
    ]);
    return { scrolls: received, unread };
  });

  fastify.get('/api/scrolls/unread', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return { unread: await unreadCount(accountId) };
  });

  fastify.post('/api/scrolls', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (!other) return reply.code(400).send({ error: 'No recipient available' });
    const { body, origin, dest } = req.body ?? {};
    try {
      const scroll = await createScroll({
        senderId: accountId,
        recipientId: other.id,
        body,
        origin: origin ?? {},
        dest: dest ?? {},
      });
      return reply.code(201).send(scroll);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.post('/api/scrolls/:id/read', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return markRead(req.params.id, accountId);
  });
}
