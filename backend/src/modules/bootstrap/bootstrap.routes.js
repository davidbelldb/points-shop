/**
 * GET /api/bootstrap — everything the app shell needs on cold open, in one
 * round-trip: me, settings, basket, account, notifications.
 *
 * Implemented with fastify.inject (in-process self-calls), so each slice
 * reuses the real route handlers — auth, shaping, side effects all identical
 * to calling the endpoints individually, with zero logic duplication.
 * Slices that fail (e.g. 401 when logged out) come back null.
 */

const SLICES = {
  me: '/api/auth/me',
  settings: '/api/settings',
  basket: '/api/basket',
  account: '/api/account',
  notifications: '/api/notifications',
};

export default async function bootstrapRoutes(fastify) {
  fastify.get('/api/bootstrap', async (req) => {
    const headers = { cookie: req.headers.cookie ?? '' };
    const out = {};
    await Promise.all(
      Object.entries(SLICES).map(async ([key, url]) => {
        try {
          const res = await fastify.inject({ method: 'GET', url, headers });
          out[key] = res.statusCode === 200 ? res.json() : null;
        } catch {
          out[key] = null;
        }
      }),
    );
    return out;
  });
}
