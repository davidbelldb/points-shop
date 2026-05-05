import {
  findOtherUser, listMessages, sendMessage, markAllRead, deleteMessage,
} from './chat.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

export default async function chatRoutes(fastify) {
  fastify.get('/api/messages', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (!other) return { other: null, messages: [] };
    const messages = await listMessages(accountId, other.id);
    return { other, messages };
  });

  fastify.post('/api/messages', async (req, reply) => {
    const { body } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (!other) return reply.code(400).send({ error: 'No recipient available' });
    try {
      return reply.code(201).send(await sendMessage(accountId, other.id, body));
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.post('/api/messages/mark-read', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (other) await markAllRead(accountId, other.id);
    return { ok: true };
  });

  fastify.delete('/api/messages/:id', async (req) => {
    const accountId = getEffectiveAccountId(req);
    await deleteMessage(req.params.id, accountId);
    return { ok: true };
  });
}
