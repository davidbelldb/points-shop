import { config } from '../../config.js';
import {
  listMilestones,
  getMilestone,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  reorderMilestones,
} from './timeline.repo.js';

const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

function requireAdmin(req, reply) {
  if (req.user?.actualRole !== 'admin') {
    reply.code(403).send({ error: 'forbidden' });
    return false;
  }
  return true;
}

function validLocation(location) {
  if (location == null) return true;
  if (typeof location !== 'object') return false;
  const { lat, lng } = location;
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
}

export default async function timelineRoutes(fastify) {
  // GET /api/timeline/milestones — public, used by the /timeline page.
  fastify.get('/api/timeline/milestones', async () => {
    return listMilestones();
  });

  /* ---- Admin: milestone CRUD ---- */

  fastify.get('/api/admin/timeline/milestones', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return listMilestones();
  });

  fastify.post('/api/admin/timeline/milestones', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { date, displayDate, title, description, icon, media, location } = req.body ?? {};
    if (!date || typeof date !== 'string') {
      return reply.code(400).send({ error: 'date is required' });
    }
    if (!validLocation(location)) {
      return reply.code(400).send({ error: 'location must be { lat, lng, label? } or null' });
    }
    const created = await createMilestone({ date, displayDate, title, description, icon, media, location });
    return reply.code(201).send(created);
  });

  fastify.patch('/api/admin/timeline/milestones/reorder', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { ids } = req.body ?? {};
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      return reply.code(400).send({ error: 'ids must be an array of milestone ids' });
    }
    return reorderMilestones(ids);
  });

  fastify.patch('/api/admin/timeline/milestones/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { location } = req.body ?? {};
    if (!validLocation(location)) {
      return reply.code(400).send({ error: 'location must be { lat, lng, label? } or null' });
    }
    const updated = await updateMilestone(req.params.id, req.body ?? {});
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  fastify.delete('/api/admin/timeline/milestones/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const ok = await deleteMilestone(req.params.id);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  fastify.get('/api/admin/timeline/milestones/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const milestone = await getMilestone(req.params.id);
    if (!milestone) return reply.code(404).send({ error: 'Not found' });
    return milestone;
  });

  /* ---- Admin: place search (Google Places, key kept server-side) ---- */

  // GET /api/admin/places/search?q=QUERY — up to 5 candidate places with
  // name, formatted address, and lat/lng, for the milestone location picker.
  fastify.get('/api/admin/places/search', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = String(req.query?.q ?? '').trim();
    if (!q) return reply.code(400).send({ error: 'q required' });
    if (!config.googlePlaces.apiKey) {
      return reply.code(503).send({ error: 'Google Places not configured on this server' });
    }

    try {
      const url = `${PLACES_TEXT_SEARCH_URL}?query=${encodeURIComponent(q)}&key=${config.googlePlaces.apiKey}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        return reply.code(502).send({ error: data.error_message || `Places API error: ${data.status}` });
      }

      const results = (data.results ?? []).slice(0, 5).map((r) => ({
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address,
        lat: r.geometry?.location?.lat ?? null,
        lng: r.geometry?.location?.lng ?? null,
      }));
      return results;
    } catch (e) {
      fastify.log.error({ err: e }, 'places search error');
      return reply.code(502).send({ error: 'Places API unreachable' });
    }
  });
}
