import {
  listEvents, listUpcoming, getEvent,
  createEvent, updateEvent, deleteEvent,
} from './calendar.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

export default async function calendarRoutes(fastify) {
  /* Range query — caller supplies from/to as ISO strings. Used by the
     /calendar page month view (and could be used by week / agenda later). */
  fastify.get('/api/calendar/events', async (req, reply) => {
    const { from, to } = req.query ?? {};
    if (!from || !to) return reply.code(400).send({ error: 'from and to required' });
    return listEvents(String(from), String(to));
  });

  /* Next N events still in progress or upcoming. Used by the home preview. */
  fastify.get('/api/calendar/upcoming', async (req) => {
    const limit = Math.min(Math.max(Number(req.query?.limit ?? 3), 1), 20);
    return listUpcoming(limit);
  });

  fastify.get('/api/calendar/events/:id', async (req, reply) => {
    const ev = await getEvent(req.params.id);
    if (!ev) return reply.code(404).send({ error: 'not found' });
    return ev;
  });

  fastify.post('/api/calendar/events', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      return reply.code(201).send(await createEvent(accountId, req.body ?? {}));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  /* Either account may edit any event — shared-calendar semantics. */
  fastify.patch('/api/calendar/events/:id', async (req, reply) => {
    try {
      const ev = await updateEvent(req.params.id, req.body ?? {});
      if (!ev) return reply.code(404).send({ error: 'not found' });
      return ev;
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/calendar/events/:id', async (req) => {
    await deleteEvent(req.params.id);
    return { ok: true };
  });
}
