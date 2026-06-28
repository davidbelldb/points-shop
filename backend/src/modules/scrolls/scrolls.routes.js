import {
  getSettings, getFrames, updateSettings, replaceFrames,
  createScroll, listReceived, listIncoming, unreadCount, markRead, resolveDueScrolls,
  pushStreetSubtitleUpdates, saveLiveActivityToken,
  getForecastSettings, updateForecastSettings, runForecastScheduler, sendForecastNow,
} from './scrolls.repo.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { buildFlightPath } from './flightPath.js';
import { getEffectiveAccountId, getActualAccountId, isAdmin } from '../auth/auth.helpers.js';

// Background delivery resolver. A scroll only "arrives" once its crow has flown
// the distance; this timer flips due scrolls to delivered and fires the arrival
// push. listReceived also filters by deliver_at, so delivery is correct even if
// the timer is mid-cycle.
let resolverStarted = false;
function startResolver() {
  if (resolverStarted) return;
  resolverStarted = true;
  setInterval(() => { resolveDueScrolls().catch(() => {}); }, 5_000);
  // Narrate each in-flight crow past Cambridge streets as it travels. Polled
  // tightly so node updates land close to when the progress bar reaches them.
  setInterval(() => { pushStreetSubtitleUpdates().catch(() => {}); }, 2_000);
  // Daily weather forecast scroll — checked once a minute against the schedule.
  setInterval(() => { runForecastScheduler().catch(() => {}); }, 60_000);
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

  // ----- Daily weather forecast scroll (admin-only config) -----
  fastify.get('/api/scrolls/forecast-config', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return getForecastSettings();
  });

  fastify.put('/api/scrolls/forecast-config', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return updateForecastSettings(req.body ?? {});
  });

  // Send a test forecast immediately (admin), bypassing the schedule.
  fastify.post('/api/scrolls/forecast-test', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const ok = await sendForecastNow();
    if (!ok) return reply.code(502).send({ error: 'Could not fetch the forecast just now — try again shortly.' });
    return { ok: true };
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

  // In-flight scrolls heading to you — for the "crow incoming" countdown.
  fastify.get('/api/scrolls/incoming', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return { incoming: await listIncoming(accountId) };
  });

  // Register a Live Activity push token (push-to-start or per-scroll update).
  // body: { kind: 'pts' | 'update', token, scrollId? }
  fastify.post('/api/scrolls/live-activity-token', async (req, reply) => {
    const accountId = getActualAccountId(req);
    const { kind, token, scrollId } = req.body ?? {};
    if ((kind !== 'pts' && kind !== 'update') || !token) {
      return reply.code(400).send({ error: 'kind (pts|update) and token required' });
    }
    await saveLiveActivityToken({ accountId, kind, scrollId: scrollId || null, token });
    return { ok: true };
  });

  fastify.post('/api/scrolls', async (req, reply) => {
    const { body, origin, dest, simulate } = req.body ?? {};

    // Simulation (the /new-chat test harness): the scroll loops back to your
    // own actual account — full pipeline, but the partner is never the
    // recipient, so they see nothing. We use the ACTUAL account id (not the
    // effective one) so a test scroll can never land on the partner even while
    // impersonating them.
    let senderId, recipientId;
    if (simulate) {
      senderId = recipientId = getActualAccountId(req);
    } else {
      senderId = getEffectiveAccountId(req);
      const other = await findOtherUser(senderId);
      if (!other) return reply.code(400).send({ error: 'No recipient available' });
      recipientId = other.id;
    }

    try {
      const scroll = await createScroll({
        senderId,
        recipientId,
        body,
        origin: origin ?? {},
        dest: dest ?? {},
        simulated: !!simulate,
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

  // Crow flight path — plots a road-following route between sender and recipient
  // for the in-app map / Live Activity to animate the crow along. Self-contained
  // (no push needed): the client polls/animates against flight_seconds itself.
  fastify.post('/api/scrolls/flight-path', async (req, reply) => {
    getEffectiveAccountId(req); // require an authenticated session
    const { origin, dest } = req.body ?? {};
    if (origin?.lat == null || origin?.lng == null || dest?.lat == null || dest?.lng == null) {
      return reply.code(400).send({ error: 'origin and dest {lat,lng} required' });
    }
    const path = await buildFlightPath({
      originLat: origin.lat, originLng: origin.lng,
      destLat: dest.lat, destLng: dest.lng,
    });
    return { ...path, origin_label: origin.label ?? null, dest_label: dest.label ?? null };
  });
}
