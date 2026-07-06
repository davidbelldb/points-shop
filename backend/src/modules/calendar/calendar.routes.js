import {
  listEvents, listUpcoming, getEvent,
  createEvent, updateEvent, deleteEvent,
} from './calendar.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { syncEventSnacks } from '../shopping/shopping.routes.js';
import { sendPush } from '../notifications/push.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { query } from '../../db.js';

// Notify the partner that an event was created: "{creator} created an event."
// with "{title} {date} {time}". Best-effort; never blocks the create.
async function notifyPartnerOfEvent(creatorId, ev) {
  try {
    const other = await findOtherUser(creatorId);
    if (!other) return;
    const me = await query(`SELECT name FROM accounts WHERE id = $1`, [creatorId]);
    const creatorName = me.rows[0]?.name ?? 'Someone';
    const start = new Date(ev.starts_at);
    const opts = { timeZone: 'Europe/London' };
    const dateStr = new Intl.DateTimeFormat('en-GB', { ...opts, weekday: 'short', day: 'numeric', month: 'short' }).format(start);
    const timeStr = ev.all_day ? '' : ` ${new Intl.DateTimeFormat('en-GB', { ...opts, hour: '2-digit', minute: '2-digit', hour12: false }).format(start)}`;
    const title = `${creatorName} created an event.`;
    const body = `${ev.title} ${dateStr}${timeStr}`.trim();
    await query(
      `INSERT INTO notifications (account_id, type, title, body, link_url)
       VALUES ($1, 'calendar', $2, $3, '/calendar')`,
      [other.id, title, body],
    );
    await sendPush(other.id, { title, body, url: '/calendar', tag: 'calendar-event' });
  } catch { /* best effort */ }
}

export default async function calendarRoutes(fastify) {
  /* The other account — used by the editor to label the "Invite {name}" box. */
  fastify.get('/api/calendar/partner', async (req) => {
    const other = await findOtherUser(getEffectiveAccountId(req));
    return other ? { id: other.id, name: other.name } : { id: null, name: null };
  });

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
      const ev = await createEvent(accountId, req.body ?? {});
      // Snacks on a new event → auto-create the shopping trip for its date.
      syncEventSnacks(ev, accountId).catch((err) => req.log.warn({ err }, 'snack sync failed'));
      // Notify the partner unless the "Invite" box was unticked (default = invite).
      if (req.body?.invite !== false) {
        notifyPartnerOfEvent(accountId, ev).catch((err) => req.log.warn({ err }, 'event invite notify failed'));
      }
      return reply.code(201).send(ev);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  /* Either account may edit any event — shared-calendar semantics. */
  fastify.patch('/api/calendar/events/:id', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      const ev = await updateEvent(req.params.id, req.body ?? {});
      if (!ev) return reply.code(404).send({ error: 'not found' });
      // Snacks added/changed later → create the trip then, and append any
      // new snacks to it on every save.
      syncEventSnacks(ev, accountId).catch((err) => req.log.warn({ err }, 'snack sync failed'));
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
