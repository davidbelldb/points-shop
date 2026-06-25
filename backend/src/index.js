import { mkdir } from 'fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { pool } from './db.js';
import { registerAppRoutes } from './modules/routes.js';
import { SESSION_COOKIE } from './modules/auth/auth.routes.js';
import { findSession, ensureDefaultPasswords } from './modules/auth/auth.repo.js';
import { registerBackgroundJobs } from './jobs/index.js';

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

// Global admin gate for every /api/admin/* route. Admin auth used to be enforced
// ONLY by Caddy basicauth at the edge, which the native iOS app (and any browser
// without the cached basic-auth creds, e.g. Edge on Windows) can't satisfy —
// producing 401s on admin features like the timeline/journal editor. Enforcing
// admin here, off the normal session cookie, makes admin work everywhere and
// lets us drop the edge basicauth on /api/admin/* without exposing any endpoint
// (several admin modules have no per-route admin check of their own).
fastify.addHook('onRequest', async (req, reply) => {
  if (req.method === 'OPTIONS') return; // let CORS preflight through
  const path = req.url.split('?')[0];
  if (path === '/api/admin' || path.startsWith('/api/admin/')) {
    if (req.user?.actualRole !== 'admin') {
      return reply.code(req.user ? 403 : 401).send({ error: 'admin only' });
    }
  }
});
// No upload size cap (@fastify/multipart defaults to 1MB if unset, so we set an
// effectively-unlimited ceiling). Sneaky stories can be long videos/voice notes.
await fastify.register(multipart, { limits: { fileSize: Number.MAX_SAFE_INTEGER } });
await fastify.register(fastifyStatic, {
  root: MEDIA_DIR,
  prefix: '/media/',
  decorateReply: false,
  // Uploaded files get unique generated filenames and never change, so
  // browsers can cache them hard — stops every photo/sprite/voice note
  // re-downloading on each visit.
  maxAge: '365d',
  immutable: true,
});

fastify.get('/health', async () => {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return { status: 'ok', db: rows[0].ok === 1, ts: new Date().toISOString() };
});

// All API routes are registered here — see modules/routes.js for the full
// list and instructions for adding a new module.
await registerAppRoutes(fastify);

await ensureDefaultPasswords().catch((e) => fastify.log.error({ err: e }, 'password seed failed'));

// All recurring/one-shot background work (data backfills, scheduled push
// poller, expired-session cleanup) lives in ./jobs — see that module for
// details on what runs and why.
registerBackgroundJobs(fastify);

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
