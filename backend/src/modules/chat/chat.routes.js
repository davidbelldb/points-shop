import {
  findOtherUser, listMessages, sendMessage, markAllRead, deleteMessage,
  editMessage, setReaction,
} from './chat.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

// Whitelist of allowed reaction keys. Keep tiny — we render a fixed emoji
// per key in the frontend, so adding new ones requires both ends to know.
const ALLOWED_REACTIONS = new Set(['heart']);

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

  // Edit an existing message — sender only. Sets edited_at so UI can mark it.
  fastify.patch('/api/messages/:id', async (req, reply) => {
    const { body } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    const accountId = getEffectiveAccountId(req);
    try {
      return await editMessage(req.params.id, accountId, body);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // Toggle the reaction on a message. Either participant may react.
  // Body: { reaction: 'heart' | null }. Null clears the reaction.
  fastify.put('/api/messages/:id/reaction', async (req, reply) => {
    const { reaction } = req.body ?? {};
    if (reaction != null && !ALLOWED_REACTIONS.has(reaction)) {
      return reply.code(400).send({ error: 'unsupported reaction' });
    }
    const accountId = getEffectiveAccountId(req);
    try {
      return await setReaction(req.params.id, accountId, reaction ?? null);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
