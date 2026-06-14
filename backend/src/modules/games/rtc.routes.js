/**
 * WebRTC Signaling Relay
 *
 * Tiny in-memory message-passing layer so the two players can exchange
 * SDP offers/answers and ICE candidates without a WebSocket server.
 *
 * Messages live for 60 s max. Once a peer connection is established the
 * server is no longer in the loop — all media flows peer-to-peer.
 */

import crypto from 'node:crypto';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { findOtherUser } from '../chat/chat.repo.js';

// How long minted TURN credentials remain valid for. Calls are short, but
// give plenty of headroom in case ICE renegotiates mid-call.
const TURN_CRED_TTL_SECONDS = 3600;

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
  // POST /api/rtc/signal  { type: 'offer'|'answer'|'ice'|'hangup'|'camstate', payload: {} }
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

  // GET /api/rtc/turn-credentials
  // Mints short-lived TURN credentials (coturn's shared-secret REST API
  // scheme: username = "<expiry-epoch>:<account>", credential =
  // base64(HMAC-SHA1(secret, username))) so calls can fall back to a relay
  // when direct peer-to-peer ICE fails (symmetric NAT, CGNAT, restrictive
  // mobile networks). Returns an empty list if TURN isn't configured on
  // this deployment, in which case callers just fall back to STUN-only.
  fastify.get('/api/rtc/turn-credentials', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const secret = process.env.TURN_SECRET;
    const host = process.env.TURN_EXTERNAL_IP;
    if (!secret || !host) {
      return { iceServers: [] };
    }

    const expiry = Math.floor(Date.now() / 1000) + TURN_CRED_TTL_SECONDS;
    const username = `${expiry}:${accountId}`;
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');

    return {
      iceServers: [
        { urls: `turn:${host}:3478?transport=udp`, username, credential },
        { urls: `turn:${host}:3478?transport=tcp`, username, credential },
      ],
    };
  });
}
