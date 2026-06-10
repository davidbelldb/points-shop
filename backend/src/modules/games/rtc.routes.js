/**
 * WebRTC Signaling Relay
 *
 * Tiny in-memory message-passing layer so the two players can exchange
 * SDP offers/answers and ICE candidates without a WebSocket server.
 *
 * Messages live for 60 s max. Once a peer connection is established the
 * server is no longer in the loop — all media flows peer-to-peer.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { findOtherUser } from '../chat/chat.repo.js';

// accountId → [{ type, payload, at }]
const inbox = new Map();

function getInbox(id) {
  if (!inbox.has(id)) inbox.set(id, []);
  return inbox.get(id);
}

function pruneOld() {
  const cut = Date.now() - 60_000;
  for (const [id, msgs] of inbox.entries()) {
    const fresh = msgs.filter(m => m.at > cut);
    if (fresh.length) inbox.set(id, fresh);
    else inbox.delete(id);
  }
}

export async function rtcRoutes(fastify) {
  // POST /api/rtc/signal  { type: 'offer'|'answer'|'ice'|'hangup', payload: {} }
  // Delivers the signal to the calling user's partner.
  fastify.post('/api/rtc/signal', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const { type, payload } = req.body ?? {};
    if (!type || payload === undefined) {
      return reply.code(400).send({ error: 'type and payload required' });
    }

    const other = await findOtherUser(accountId);
    if (!other) return reply.code(400).send({ error: 'No partner found' });

    getInbox(other.id).push({ type, payload, at: Date.now() });
    pruneOld();
    return { ok: true };
  });

  // GET /api/rtc/signal
  // Returns and clears all pending signal messages addressed to the caller.
  fastify.get('/api/rtc/signal', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const msgs = inbox.get(accountId) ?? [];
    inbox.delete(accountId);
    return { signals: msgs };
  });
}
