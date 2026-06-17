import {
  findOtherUser, listMessages, sendMessage, markAllRead, deleteMessage,
  editMessage, setReaction, toggleSparkle, setTyping, votePoll,
} from './chat.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';

// Whitelist of allowed reaction keys. Keep tiny — we render a fixed emoji
// per key in the frontend, so adding new ones requires both ends to know.
const ALLOWED_REACTIONS = new Set(['heart', '😂', '💜', '🍆', '🫦', '😲']);

export default async function chatRoutes(fastify) {
  fastify.get('/api/messages', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (!other) return { other: null, messages: [] };
    const messages = await listMessages(accountId, other.id);
    return { other, messages };
  });

  const NUDGE_BODY = '__nudge__';
  const SYSTEM_BODIES = new Set(['__nudge__', '__rain_twirl__', '__rain_popcorn__', '__rain_duck__']);

  fastify.post('/api/messages', async (req, reply) => {
    const { body, reply_to_story_id, reply_to_message_id, slider_response } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    // System messages (nudge, rain) may not be sent as replies.
    if (SYSTEM_BODIES.has(body.trim()) && (reply_to_story_id || reply_to_message_id)) {
      return reply.code(400).send({ error: 'system messages cannot be replies' });
    }
    const accountId = getEffectiveAccountId(req);
    const other = await findOtherUser(accountId);
    if (!other) return reply.code(400).send({ error: 'No recipient available' });
    try {
      return reply.code(201).send(
        await sendMessage(
          accountId, other.id, body,
          reply_to_story_id || null,
          reply_to_message_id || null,
          slider_response || null,
        ),
      );
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
    if (SYSTEM_BODIES.has(body.trim())) {
      return reply.code(400).send({ error: 'cannot edit a system message' });
    }
    const accountId = getEffectiveAccountId(req);
    try {
      return await editMessage(req.params.id, accountId, body);
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // Stamp typing_at on the current user so the other person can see the indicator.
  fastify.put('/api/messages/typing', async (req) => {
    const accountId = getEffectiveAccountId(req);
    await setTyping(accountId);
    return { ok: true };
  });

  // Toggle sparkle on a message — either participant may sparkle any message.
  fastify.put('/api/messages/:id/sparkle', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    try {
      return await toggleSparkle(req.params.id, accountId);
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

  // Cast or change a poll vote. Body: { option_idx: number }
  fastify.put('/api/messages/:id/vote', async (req, reply) => {
    const { option_idx } = req.body ?? {};
    if (typeof option_idx !== 'number') return reply.code(400).send({ error: 'option_idx required' });
    const accountId = getEffectiveAccountId(req);
    try {
      return { votes: await votePoll(req.params.id, accountId, option_idx) };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });
}
