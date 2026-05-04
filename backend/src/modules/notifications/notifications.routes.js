import { listNotifications, unreadCount, markAllRead } from './notifications.repo.js';

export default async function notificationsRoutes(fastify) {
  fastify.get('/api/notifications', async () => {
    const [items, count] = await Promise.all([listNotifications(), unreadCount()]);
    return { items, unread_count: count };
  });

  fastify.post('/api/notifications/mark-read', async () => {
    await markAllRead();
    return { ok: true };
  });
}
