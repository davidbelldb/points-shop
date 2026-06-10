import {
  findByUsername, findById, createSession, deleteSession, verifyPassword,
} from './auth.repo.js';
import { query } from '../../db.js';

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
    actual_username: req?.user?.actualUsername ?? account.username,
    actual_role: req?.user?.actualRole ?? account.role,
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

  fastify.get('/api/admin/users', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { rows } = await query(
      `SELECT id, username, role, name, photo_url, notifications_muted_until
         FROM accounts ORDER BY role DESC, username ASC`,
    );
    return rows;
  });

  // Temporarily silence push notifications for an account — e.g. so a
  // partner's phone doesn't buzz with "your turn" pushes while their account
  // is being driven via impersonation for testing.
  fastify.post('/api/admin/users/:id/mute', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const minutes = Number(req.body?.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return reply.code(400).send({ error: 'minutes must be a positive number' });
    }
    const { rows } = await query(
      `UPDATE accounts SET notifications_muted_until = NOW() + ($2 || ' minutes')::interval
        WHERE id = $1
        RETURNING id, notifications_muted_until`,
      [req.params.id, minutes],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'User not found' });
    return rows[0];
  });

  fastify.delete('/api/admin/users/:id/mute', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { rows } = await query(
      `UPDATE accounts SET notifications_muted_until = NULL
        WHERE id = $1
        RETURNING id, notifications_muted_until`,
      [req.params.id],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'User not found' });
    return rows[0];
  });

  fastify.post('/api/admin/impersonate', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    const { target_user_id } = req.body ?? {};
    if (!target_user_id) return reply.code(400).send({ error: 'target_user_id required' });
    const target = await findById(target_user_id);
    if (!target) return reply.code(404).send({ error: 'User not found' });
    if (target.id === req.user.actualAccountId) {
      return reply.code(400).send({ error: 'Cannot impersonate yourself' });
    }
    await query(
      `UPDATE sessions SET impersonating_account_id = $1 WHERE token = $2`,
      [target_user_id, req.user.token],
    );
    return { ok: true, impersonating: target };
  });

  fastify.delete('/api/admin/impersonate', async (req, reply) => {
    if (req.user?.actualRole !== 'admin') return reply.code(403).send({ error: 'Admin only' });
    await query(
      `UPDATE sessions SET impersonating_account_id = NULL WHERE token = $1`,
      [req.user.token],
    );
    return { ok: true };
  });

  fastify.get('/api/auth/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Not authenticated' });
    const account = await findById(req.user.effectiveAccountId);
    if (!account) return reply.code(404).send({ error: 'Account not found' });
    return publicUser(account, req);
  });
}
