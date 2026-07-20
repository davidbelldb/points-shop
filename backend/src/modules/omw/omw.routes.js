import {
  listDestinations, getDestination, setDestination,
  saveOmwToken, startTrip, recordPing, cancelTrip, sweepStaleTrips,
} from './omw.repo.js';
import { getActualAccountId, isAdmin } from '../auth/auth.helpers.js';

/*
 * "On My Way" API.
 *
 * Admin owns the per-user destinations (David → Blinco Grove, Katie → Bishops
 * Court). Any authenticated user can start/ping/cancel their own trip, but v1
 * is gated to admin in the UI (the /new-chat test harness) and loops back to
 * the traveller's own device.
 */

let sweeperStarted = false;
function startSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  // Cancel abandoned trips every minute so no banner is orphaned.
  setInterval(() => { sweepStaleTrips().catch(() => {}); }, 60_000);
}

export default async function omwRoutes(fastify) {
  startSweeper();

  // ----- Destinations (admin-managed) -----
  fastify.get('/api/omw/destinations', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return { destinations: await listDestinations() };
  });

  fastify.put('/api/omw/destinations/:accountId', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const { label, lat, lng } = req.body ?? {};
    try {
      return await setDestination(req.params.accountId, { label, lat, lng });
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // The caller's own configured destination (used by the trigger flow).
  fastify.get('/api/omw/my-destination', async (req) => {
    const accountId = getActualAccountId(req);
    return { destination: await getDestination(accountId) };
  });

  // ----- Live Activity push tokens -----
  // body: { kind: 'pts' | 'update', token, tripId? }
  fastify.post('/api/omw/live-activity-token', async (req, reply) => {
    const accountId = getActualAccountId(req);
    const { kind, token, tripId } = req.body ?? {};
    if ((kind !== 'pts' && kind !== 'update') || !token) {
      return reply.code(400).send({ error: 'kind (pts|update) and token required' });
    }
    await saveOmwToken({ accountId, kind, tripId: tripId || null, token });
    return { ok: true };
  });

  // ----- Trips -----
  // Start a trip from the caller's current location toward their destination.
  // body: { origin: { lat, lng } }
  fastify.post('/api/omw/trips', async (req, reply) => {
    const travellerId = getActualAccountId(req);
    const { origin } = req.body ?? {};
    try {
      const trip = await startTrip({ travellerId, origin: origin ?? {}, simulate: true });
      return reply.code(201).send(trip);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // Location update. body: { lat, lng }
  fastify.post('/api/omw/trips/:id/ping', async (req, reply) => {
    const travellerId = getActualAccountId(req);
    const { lat, lng } = req.body ?? {};
    if (lat == null || lng == null) return reply.code(400).send({ error: 'lat and lng required' });
    return recordPing({ tripId: req.params.id, travellerId, lat: Number(lat), lng: Number(lng) });
  });

  // Cancel / arrive-early.
  fastify.post('/api/omw/trips/:id/end', async (req) => {
    const travellerId = getActualAccountId(req);
    return cancelTrip({ tripId: req.params.id, travellerId });
  });
}
