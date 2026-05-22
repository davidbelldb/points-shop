import { mkdir } from 'fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { pool } from './db.js';
import productsRoutes from './modules/products/products.routes.js';
import accountsRoutes from './modules/accounts/accounts.routes.js';
import basketRoutes from './modules/basket/basket.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import discountsRoutes from './modules/discounts/discounts.routes.js';
import deliveryRoutes from './modules/delivery/delivery.routes.js';
import heroRoutes from './modules/hero/hero.routes.js';
import reviewsRoutes from './modules/reviews/reviews.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import surveysRoutes from './modules/surveys/surveys.routes.js';
import authRoutes, { SESSION_COOKIE } from './modules/auth/auth.routes.js';
import chatRoutes from './modules/chat/chat.routes.js';
import todRoutes from './modules/tod/tod.routes.js';
import gamesRoutes from './modules/games/games.routes.js';
import giftsweeperRoutes from './modules/games/giftsweeper.routes.js';
import rewardsRoutes from './modules/rewards/rewards.routes.js';
import wheelRoutes from './modules/wheel/wheel.routes.js';
import stbRoutes from './modules/games/stb.routes.js';
import rewatchRoutes from './modules/rewatch/rewatch.routes.js';
import { findSession, ensureDefaultPasswords } from './modules/auth/auth.repo.js';

const MEDIA_DIR = config.mediaDir;
await mkdir(MEDIA_DIR, { recursive: true });

const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
  },
});

await fastify.register(cors, { origin: true, credentials: true });
await fastify.register(cookie);

fastify.addHook('onRequest', async (req) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  try {
    const session = await findSession(token);
    if (session) {
      req.user = {
        actualAccountId: session.account_id,
        actualRole: session.role,
        actualUsername: session.username,
        effectiveAccountId: session.impersonating_account_id || session.account_id,
        impersonating: !!session.impersonating_account_id,
        token,
      };
    }
  } catch (e) {
    fastify.log.error({ err: e }, 'auth hook error');
  }
});
await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
await fastify.register(fastifyStatic, {
  root: MEDIA_DIR,
  prefix: '/media/',
  decorateReply: false,
});

fastify.get('/health', async () => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return { status: 'ok', db: rows[0].ok === 1, ts: new Date().toISOString() };
});

await fastify.register(productsRoutes);
await fastify.register(accountsRoutes);
await fastify.register(basketRoutes);
await fastify.register(ordersRoutes);
await fastify.register(adminRoutes);
await fastify.register(settingsRoutes);
await fastify.register(discountsRoutes);
await fastify.register(deliveryRoutes);
await fastify.register(heroRoutes);
await fastify.register(reviewsRoutes);
await fastify.register(notificationsRoutes);
await fastify.register(surveysRoutes);
await fastify.register(authRoutes);
await fastify.register(chatRoutes);
await fastify.register(todRoutes);
await fastify.register(gamesRoutes);
await fastify.register(giftsweeperRoutes);
await fastify.register(rewardsRoutes);
await fastify.register(wheelRoutes);
await fastify.register(stbRoutes);
await fastify.register(rewatchRoutes);

await ensureDefaultPasswords().catch((e) => fastify.log.error({ err: e }, 'password seed failed'));

const shutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, shutting down`);
  await fastify.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await fastify.listen({ port: config.port, host: config.host });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
