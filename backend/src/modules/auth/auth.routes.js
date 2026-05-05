import {
  findByUsername, findById, createSession, deleteSession, verifyPassword,
} from './auth.repo.js';

export const SESSION_COOKIE = 'sneaky_session';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30,
};

function publicUser(account, req) {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    name: account.name,
    email: account.email,
    photo_url: account.photo_url ?? null,
    points_balance: account.points_balance ?? 0,
    actual_id: req?.user?.actualAccountId ?? account.id,
    impersonating: req?.user?.impersonating ?? false,
  };
}

export default async function authRoutes(fastify) {
  fastify.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password required' });
    }
    const account = await findByUsername(username);
    if (!account) return reply.code(401).send({ error: 'Invalid credentials' });
    const ok = await verifyPassword(account, password);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });
    const token = await createSession(account.id);
    reply.setCookie(SESSION_COOKIE, token, cookieOptions);
    return publicUser(account, req);
  });

  fastify.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  fastify.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Not authenticated' });
    const account = await findById(req.user.effectiveAccountId);
    if (!account) return reply.code(404).send({ error: 'Account not found' });
    return publicUser(account, req);
  });
}
