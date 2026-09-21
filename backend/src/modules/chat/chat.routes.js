import {
  findOtherUser, findPartner, listPartners, listMessages, sendMessage, markAllRead, messageFlight,
  deleteMessage, editMessage, setReaction, toggleSparkle, setTyping, votePoll,
  revealSecretMessage, unreadCountTotal, findLatestSender, getMessageFlight, hasLocation,
  resolveDueMessageActivities,
} from './chat.repo.js';
import { unreadCount as scrollsUnreadCount } from '../scrolls/scrolls.repo.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { areFriends } from '../friends/friends.repo.js';

// Whitelist of allowed reaction keys. Keep tiny — we render a fixed emoji
// per key in the frontend, so adding new ones requires both ends to know.
const ALLOWED_REACTIONS = new Set(['heart', '😂', '💜', '🍆', '🫦', '😲']);

// Keeps every in-flight message's Live Activity moving: waypoint updates while
// the crow travels, and the landing when it gets there. Polled a touch tighter
// than the waypoints are spaced so a node pops close to when it's due.
let activityTimer = false;
function startMessageActivityResolver() {
  if (activityTimer) return;
  activityTimer = true;
  setInterval(() => { resolveDueMessageActivities().catch(() => {}); }, 3_000);
}

export default async function chatRoutes(fastify) {
  startMessageActivityResolver();

  // Resolve who a request is addressed to. An explicit id always wins; without
  // one we fall back to the old "the other user" guess so clients that haven't
  // been taught about partners yet keep working unchanged.
  async function resolvePartner(accountId, explicitId) {
    const other = explicitId
      ? await findPartner(accountId, explicitId)
      : await findOtherUser(accountId);
    // Being an account is no longer enough to be reachable — you have to be
    // connected. Not-a-friend reads as not-found so the endpoint can't be used
    // to work out who else exists.
    if (!other) return null;
    return (await areFriends(accountId, other.id)) ? other : null;
  }

  // The conversation list: everyone else, their unread count, and the last
  // thing either of you said.
  fastify.get('/api/messages/partners', async (req) => {
    const accountId = getEffectiveAccountId(req);
    return { partners: await listPartners(accountId) };
  });

  fastify.get('/api/messages', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const other = await resolvePartner(accountId, req.query?.with);
    if (!other) {
      if (req.query?.with) return reply.code(404).send({ error: 'No such person' });
      return { other: null, messages: [] };
    }
    // `?crows=1` is the native app saying "I draw the journey, so don't hand me
    // anything that hasn't landed". Without it the thread reads as it always
    // has, which is what keeps the web app unchanged.
    const crows = req.query?.crows === '1' || req.query?.crows === 'true';
    const messages = await listMessages(accountId, other.id, 200, { crows });
    if (!crows) return { other, messages };

    // What the NEXT message's journey would be, so the composer can say how
    // long it'll take and whose location is missing.
    const flight = await messageFlight(accountId, other.id);
    return {
      other,
      messages,
      flight: {
        seconds: flight.seconds,
        distance_km: flight.distanceKm,
        origin_label: flight.originLabel,
        dest_label: flight.destLabel,
        sender_located: flight.senderLocated,
        recipient_located: flight.recipientLocated,
      },
    };
  });

  const NUDGE_BODY = '__nudge__';
  const SYSTEM_BODIES = new Set(['__nudge__', '__rain_twirl__', '__rain_popcorn__', '__rain_duck__']);

  fastify.post('/api/messages', async (req, reply) => {
    const {
      body, reply_to_story_id, reply_to_message_id, slider_response, recipient_id,
      crows,
    } = req.body ?? {};
    if (typeof body !== 'string' || !body.trim()) {
      return reply.code(400).send({ error: 'body required' });
    }
    // System messages (nudge, rain) may not be sent as replies.
    if (SYSTEM_BODIES.has(body.trim()) && (reply_to_story_id || reply_to_message_id)) {
      return reply.code(400).send({ error: 'system messages cannot be replies' });
    }
    const accountId = getEffectiveAccountId(req);

    // A crow-aware client (the native app) has to say where it's sending from:
    // without it there's no distance, and the whole conceit falls over.
    //
    // Deliberately gated on `crows` rather than applied to everyone. The web
    // client has no screen for setting a location, so enforcing it there would
    // lock Katie out of messaging with no way to fix it.
    if (crows && !(await hasLocation(accountId))) {
      return reply.code(400).send({
        error: 'Set where you are before sending — a crow needs to know how far to fly.',
        code: 'location_required',
      });
    }

    const other = await resolvePartner(accountId, recipient_id);
    if (!other) {
      return reply.code(recipient_id ? 404 : 400).send({
        error: recipient_id ? 'No such person' : 'No recipient available',
      });
    }
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

  // Lightweight poll target for the floating head: how much is waiting across
  // every conversation, plus whoever most recently messaged you (the face the
  // bubble wears). `other` is kept for older clients that expect one partner.
  fastify.get('/api/messages/unread-count', async (req) => {
    const accountId = getEffectiveAccountId(req);
    // Unread chat (text, photos, nudges, rain) from anyone + arrived-but-unread
    // scrolls. Scrolls are summed defensively so a scrolls failure never zeroes
    // the badge.
    const [msgCount, scrollCount, latest] = await Promise.all([
      unreadCountTotal(accountId),
      scrollsUnreadCount(accountId).catch(() => 0),
      findLatestSender(accountId),
    ]);
    const count = msgCount + scrollCount;
    let other = latest ?? await findOtherUser(accountId);
    if (other && !(await areFriends(accountId, other.id))) other = null;
    if (!other) return { count, other: null };
    return {
      count,
      other: { id: other.id, name: other.name, photo_url: other.photo_url ?? null },
    };
  });

  // With a partner, marks that conversation read; without one, marks the lot.
  fastify.post('/api/messages/mark-read', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const partnerId = req.body?.partner_id ?? req.query?.with ?? null;
    if (partnerId) {
      const other = await findPartner(accountId, partnerId);
      if (other) await markAllRead(accountId, other.id);
    } else {
      // No partner named: clear everything, so the badge (which counts every
      // conversation) can't be left stuck by an older client.
      await markAllRead(accountId, null);
    }
    return { ok: true };
  });

  // One message's journey, for the tracker sheet that slides up from its
  // bubble. Either participant may watch it; a message with no route recorded
  // (a gesture, or one sent before anyone set a location) has nothing to show.
  fastify.get('/api/messages/:id/flight', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const flight = await getMessageFlight(req.params.id, accountId);
    if (!flight) {
      return reply.code(404).send({ error: 'No route recorded for this one', code: 'no_route' });
    }
    return { flight };
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

  // Reveal a secret message — only the recipient may call this.
  fastify.put('/api/messages/:id/reveal', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const result = await revealSecretMessage(req.params.id, accountId);
    if (!result) return reply.code(404).send({ error: 'not found or already revealed' });
    return result;
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
