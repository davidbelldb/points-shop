import { listNotifications, unreadCount, markAllRead, deleteNotification, deleteAllNotifications } from './notifications.repo.js';

export default async function notificationsRoutes(fastify) {
  fastify.get('/api/notifications', async () => {
    const [items, count] = await Promise.all([listNotifications(), unreadCount()]);
    return { items, unread_count: count };
  });

  fastify.post('/api/notifications/mark-read', async () => {
    await markAllRead();
    return { ok: true };
  });

  fastify.delete('/api/notifications/:id', async (req) => {
    await deleteNotification(req.params.id);
    return { ok: true };
  });

  fastify.delete('/api/notifications', async () => {
    await deleteAllNotifications();
    return { ok: true };
  });
}
