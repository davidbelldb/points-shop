import { mkdir } from 'fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
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

await fastify.register(cors, { origin: true });
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
