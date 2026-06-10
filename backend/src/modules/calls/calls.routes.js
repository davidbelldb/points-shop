/**
 * SneakyTime — FaceTime-style 1:1 video calling (/sneakytime).
 *
 * Media + signaling are fully reused from the Tic-Tac-Face WebRTC stack
 * (/api/rtc/signal relay). This module only adds the "ring" step: when a
 * call starts, fire a web push at the partner so they can tap to join.
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { getPlayersFor } from '../games/games.repo.js';
import { sendPush } from '../notifications/push.js';

// In-memory ring state: calleeId → { fromId, fromName, at }.
// Lets the callee's open SneakyTime page show an Answer button while
// the caller is ringing. Expires after RING_TTL_MS.
const pendingCalls = new Map();
const RING_TTL_MS = 45_000;

function getPending(calleeId) {
  const p = pendingCalls.get(calleeId);
  if (!p) return null;
  if (Date.now() - p.at > RING_TTL_MS) {
    pendingCalls.delete(calleeId);
    return null;
  }
  return p;
}

export default async function callsRoutes(fastify) {
  // GET /api/calls/players — me + partner (name/photo) for the call UI.
  fastify.get('/api/calls/players', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    return getPlayersFor(accountId);
  });

  // POST /api/calls/ring — notify the partner that a SneakyTime call started.
  fastify.post('/api/calls/ring', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const { me, other } = await getPlayersFor(accountId);
    if (!other) return reply.code(400).send({ error: 'No partner found' });

    pendingCalls.set(other.id, { fromId: accountId, fromName: me?.name ?? 'someone', at: Date.now() });

    sendPush(other.id, {
      title: `SneakyTime call from ${me?.name ?? 'someone'}`,
      body: 'Tap to Join!',
      url: '/sneakytime?join=1',
      tag: 'sneaky-call',
    });

    return { ok: true };
  });

  // GET /api/calls/status — is someone ringing me right now?
  fastify.get('/api/calls/status', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const p = getPending(accountId);
    return { incoming: !!p, from: p?.fromName ?? null };
  });

  // POST /api/calls/answer — callee picked up; clear the ring.
  fastify.post('/api/calls/answer', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    pendingCalls.delete(accountId);
    return { ok: true };
  });

  // POST /api/calls/cancel — caller hung up before the callee answered.
  fastify.post('/api/calls/cancel', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { other } = await getPlayersFor(accountId);
    if (other) {
      const p = pendingCalls.get(other.id);
      if (p?.fromId === accountId) pendingCalls.delete(other.id);
    }
    return { ok: true };
  });
}
