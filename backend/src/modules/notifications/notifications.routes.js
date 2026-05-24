import {
  listNotifications, unreadCount, markAllRead, deleteNotification, deleteAllNotifications,
  savePushSubscription, deletePushSubscription,
} from './notifications.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { config } from '../../config.js';

export default async function notificationsRoutes(fastify) {
  fastify.get('/api/notifications', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const [items, count] = await Promise.all([listNotifications(accountId), unreadCount(accountId)]);
    return { items, unread_count: count };
  });

  fastify.post('/api/notifications/mark-read', async (req) => {
    await markAllRead(getEffectiveAccountId(req));
    return { ok: true };
  });

  fastify.delete('/api/notifications/:id', async (req) => {
    await deleteNotification(req.params.id, getEffectiveAccountId(req));
    return { ok: true };
  });

  fastify.delete('/api/notifications', async (req) => {
    await deleteAllNotifications(getEffectiveAccountId(req));
    return { ok: true };
  });

  // --- Web push ---
  fastify.get('/api/notifications/vapid-key', async () => ({ key: config.vapid.publicKey }));

  fastify.post('/api/notifications/subscribe', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const sub = req.body;
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return reply.code(400).send({ error: 'invalid subscription' });
    }
    await savePushSubscription(accountId, sub);
    return { ok: true };
  });

  fastify.post('/api/notifications/unsubscribe', async (req) => {
    const endpoint = req.body?.endpoint;
    if (endpoint) await deletePushSubscription(endpoint);
    return { ok: true };
  });
}
