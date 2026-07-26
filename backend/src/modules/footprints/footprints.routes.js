import {
  recordPing, getTrail, getSettings, updateModeSettings,
} from './footprints.repo.js';
import { getActualAccountId, isAdmin } from '../auth/auth.helpers.js';

/*
 * "Marauder's Map" footprints API. David (admin) broadcasts; both he and Katie
 * watch. Trail + settings are readable by any authenticated user; posting pings
 * and editing config are admin-only.
 */
export default async function footprintsRoutes(fastify) {
  // Broadcaster drops a footprint ping (outdoor GPS now; indoor UWB later).
  fastify.post('/api/footprints/ping', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const { mode, lat, lng } = req.body ?? {};
    try {
      return await recordPing(getActualAccountId(req), mode, lat, lng);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // The broadcaster's fading trail for a mode. NOTE: admin-only for now — this is
  // David's private testing build; Katie is kept out until it's polished. To open
  // it to "both watch", drop the isAdmin gate here (and on settings-read below).
  fastify.get('/api/footprints/trail', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return getTrail(req.query?.mode);
  });

  // Per-mode config. Admin-only for now (see note above); writes always admin-only.
  fastify.get('/api/footprints/settings', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return getSettings();
  });

  fastify.put('/api/footprints/settings/:mode', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return updateModeSettings(req.params.mode, req.body ?? {});
  });
}
