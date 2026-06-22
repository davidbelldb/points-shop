import {
  listNotifications, unreadCount, markAllRead, deleteNotification, deleteAllNotifications,
  savePushSubscription, deletePushSubscription,
  saveApnsToken, deleteApnsToken,
} from './notifications.repo.js';
import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';
import { sendPush } from './push.js';
import { query } from '../../db.js';
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

  // --- Native iOS push (APNs) ---
  fastify.post('/api/notifications/apns-register', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
      req.log.warn({ accountId }, 'apns-register: missing token');
      return reply.code(400).send({ error: 'token required' });
    }
    await saveApnsToken(accountId, token);
    req.log.info({ accountId, tokenPrefix: token.slice(0, 12) }, 'apns-register: token saved');
    return { ok: true };
  });

  fastify.post('/api/notifications/apns-unregister', async (req) => {
    const token = req.body?.token;
    if (token) await deleteApnsToken(token);
    return { ok: true };
  });

  // Device-side diagnostics — the native app reports its push registration
  // lifecycle here so failures (which are otherwise silent on-device) show up
  // in the backend logs. Temporary aid for bring-up.
  fastify.post('/api/notifications/apns-debug', async (req) => {
    const accountId = getEffectiveAccountId(req);
    req.log.info({ accountId, event: req.body?.event, detail: req.body?.detail }, 'apns-debug');
    return { ok: true };
  });

  // ── Admin: broadcast push (immediate or scheduled) ────────────────────────
  fastify.post('/api/admin/push-broadcast', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Forbidden' });
    const { title, body, url, scheduledFor, accountId } = req.body ?? {};
    if (!title || !body) return reply.code(400).send({ error: 'title and body required' });

    // Scheduled — store for later
    if (scheduledFor) {
      const ts = new Date(scheduledFor);
      if (isNaN(ts.getTime()) || ts <= new Date()) {
        return reply.code(400).send({ error: 'scheduledFor must be a future datetime' });
      }
      const { rows } = await query(
        `INSERT INTO scheduled_push_notifications (title, body, url, scheduled_for, account_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [title, body, url || '/', ts, accountId || null],
      );
      return { scheduled: true, id: rows[0].id, scheduledFor: ts.toISOString() };
    }

    // Immediate — single recipient or all. sendPush fans out to both web-push
    // and APNs, so we union recipients from both device tables.
    if (accountId) {
      await sendPush(accountId, { title, body, url: url || '/' });
      return { sent: 1 };
    }
    const { rows } = await query(
      `SELECT account_id FROM push_subscriptions
       UNION
       SELECT account_id FROM apns_tokens`,
    );
    if (rows.length === 0) return { sent: 0 };
    await Promise.all(rows.map(r => sendPush(r.account_id, { title, body, url: url || '/' })));
    return { sent: rows.length };
  });

  // ── Admin: list pending scheduled pushes ─────────────────────────────────
  fastify.get('/api/admin/push-scheduled', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Forbidden' });
    const { rows } = await query(
      `SELECT id, title, body, url, scheduled_for
         FROM scheduled_push_notifications
        WHERE sent_at IS NULL
        ORDER BY scheduled_for ASC`,
    );
    return { items: rows };
  });

  // ── Admin: cancel a scheduled push ───────────────────────────────────────
  fastify.delete('/api/admin/push-scheduled/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Forbidden' });
    await query(
      `DELETE FROM scheduled_push_notifications WHERE id = $1 AND sent_at IS NULL`,
      [req.params.id],
    );
    return { ok: true };
  });

  // ── Admin: dismiss — sends a 'clear' push so devices close the notification
  // Works on Android/Chrome. iOS does not support getNotifications() in SW.
  fastify.post('/api/admin/push-dismiss', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Forbidden' });
    const { rows } = await query(`SELECT DISTINCT account_id FROM push_subscriptions`);
    if (rows.length === 0) return { sent: 0 };
    await Promise.all(rows.map(r =>
      sendPush(r.account_id, { action: 'clear', tag: 'sneaky-broadcast' }),
    ));
    return { sent: rows.length };
  });
}
