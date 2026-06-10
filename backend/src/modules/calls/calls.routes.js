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

    sendPush(other.id, {
      title: `SneakyTime call from ${me?.name ?? 'someone'}`,
      body: 'Tap to Join!',
      url: '/sneakytime?join=1',
      tag: 'sneaky-call',
    });

    return { ok: true };
  });
}
