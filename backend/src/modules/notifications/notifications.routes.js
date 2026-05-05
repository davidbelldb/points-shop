import {
  listNotifications, unreadCount, markAllRead, deleteNotification, deleteAllNotifications,
} from './notifications.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

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
}
