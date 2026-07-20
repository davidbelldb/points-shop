import {
  listQuickDestinations, setQuickDestination, deleteQuickDestination,
  saveOmwToken, startTrip, recordPing, cancelTrip, sweepStaleTrips,
} from './omw.repo.js';
import { getActualAccountId } from '../auth/auth.helpers.js';

/*
 * "On My Way" API.
 *
 * Each user self-manages up to 3 "quick destinations" (on their Account page);
 * a trip starts from their live location toward one of them. v1 is live for
 * David only (gated in the UI) and loops back to the traveller's own device.
 */

let sweeperStarted = false;
function startSweeper() {
  if (sweeperStarted) return;
  sweeperStarted = true;
  // Progress is driven by location pings (distance along the route), so no time
  // ticker is needed — just reap abandoned trips so no banner is orphaned.
  setInterval(() => { sweepStaleTrips().catch(() => {}); }, 60_000);
}

export default async function omwRoutes(fastify) {
  startSweeper();

  // ----- Quick destinations (each user manages their own) -----
  fastify.get('/api/omw/quick-destinations', async (req) => {
    const accountId = getActualAccountId(req);
    return { destinations: await listQuickDestinations(accountId) };
  });

  fastify.put('/api/omw/quick-destinations/:position', async (req, reply) => {
    const accountId = getActualAccountId(req);
    try {
      return await setQuickDestination(accountId, req.params.position, req.body ?? {});
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/omw/quick-destinations/:position', async (req) => {
    const accountId = getActualAccountId(req);
    return deleteQuickDestination(accountId, req.params.position);
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
  // Start a trip from the caller's live location to a quick destination.
  // body: { origin: { lat, lng }, destId?, transport? }  (destId defaults to slot 1)
  fastify.post('/api/omw/trips', async (req, reply) => {
    const travellerId = getActualAccountId(req);
    const { origin, destId, transport } = req.body ?? {};
    try {
      const trip = await startTrip({ travellerId, origin: origin ?? {}, destId, transport, simulate: true });
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
