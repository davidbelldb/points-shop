import {
  listFriends, listIncoming, listOutgoing, listSuggestions, listAwaitingApproval,
  requestFriend, respondToRequest, approveFriendship, removeFriendship,
} from './friends.repo.js';
import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';

export default async function friendsRoutes(fastify) {
  // Everything the caller needs to draw the whole screen in one call.
  fastify.get('/api/friends', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const [friends, incoming, outgoing, suggestions] = await Promise.all([
      listFriends(accountId), listIncoming(accountId),
      listOutgoing(accountId), listSuggestions(accountId),
    ]);
    return { friends, incoming, outgoing, suggestions };
  });

  // Just the number, for a badge.
  fastify.get('/api/friends/requests/count', async (req) => {
    const incoming = await listIncoming(getEffectiveAccountId(req));
    return { count: incoming.length };
  });

  // Ask someone. body: { account_id }
  fastify.post('/api/friends/requests', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const targetId = req.body?.account_id;
    try {
      return reply.code(201).send(await requestFriend(accountId, targetId));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // Answer one. body: { accept: true | false }
  fastify.post('/api/friends/requests/:id/respond', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const accept = req.body?.accept !== false;
    try {
      return await respondToRequest(accountId, req.params.id, accept);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/friends/:id', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return { ok: await removeFriendship(accountId, req.params.id) };
  });

  // ----- Admin sign-off, for friendships involving a child's account -----

  fastify.get('/api/friends/approvals', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    return { approvals: await listAwaitingApproval() };
  });

  // body: { approve: true | false }
  fastify.post('/api/friends/approvals/:id', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Admin only' });
    const approve = req.body?.approve !== false;
    try {
      return await approveFriendship(req.params.id, getEffectiveAccountId(req), approve);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
