/**
 * Streets of Cambs-Rage — server-side points award
 *
 * POST /api/games/cambs-rage/win
 *   Body: { difficulty: 'easy'|'medium'|'hard', matchId: string }
 *
 * Awards points to the authenticated user for beating the CPU.
 * matchId is a UUID generated client-side per match and used as an
 * idempotency key — calling this endpoint twice with the same matchId
 * is a no-op and returns { pts, alreadyClaimed: true }.
 *
 * Points: easy → 4, medium → 8, hard → 12 ('good luck' mode)
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { creditPoints, getPlayersFor } from './games.repo.js';
import { sendPush }              from '../notifications/push.js';
import { query }                 from '../../db.js';

const PTS = { easy: 4, medium: 8, hard: 12 };
const ONLINE_WIN_PTS = 10;

// ── Online challenge ring (same pattern as SneakyTime calls) ─────────────────
// challengedId → { fromId, fromName, at }
const pendingChallenges = new Map();
const CHALLENGE_TTL_MS = 60_000;

function getPendingChallenge(id) {
  const p = pendingChallenges.get(id);
  if (!p) return null;
  if (Date.now() - p.at > CHALLENGE_TTL_MS) {
    pendingChallenges.delete(id);
    return null;
  }
  return p;
}

export default async function cambsRageRoutes(fastify) {
  // POST /api/games/cambs-rage/online-win — winner of an online PvP match
  // claims their points. Idempotent per (matchId, account) so a re-render
  // can't double-credit; the loser never calls this.
  fastify.post('/api/games/cambs-rage/online-win', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const { matchId } = req.body ?? {};
    if (!matchId || typeof matchId !== 'string' || matchId.length > 64) {
      return reply.code(400).send({ error: 'matchId required' });
    }

    const reason = `cambs-rage:online:${matchId}:${accountId}`;
    const { rows } = await query(
      `SELECT 1 FROM points_ledger WHERE reason = $1 LIMIT 1`,
      [reason],
    );
    if (rows.length > 0) return { pts: ONLINE_WIN_PTS, alreadyClaimed: true };

    await creditPoints(accountId, ONLINE_WIN_PTS, reason);
    return { pts: ONLINE_WIN_PTS, alreadyClaimed: false };
  });

  // POST /api/games/cambs-rage/challenge — invite the partner to an online match.
  fastify.post('/api/games/cambs-rage/challenge', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const { me, other } = await getPlayersFor(accountId);
    if (!other) return reply.code(400).send({ error: 'No opponent found' });

    pendingChallenges.set(other.id, { fromId: accountId, fromName: me?.name ?? 'someone', at: Date.now() });

    sendPush(other.id, {
      title: `Cambs Rage challenge from ${me?.name ?? 'someone'}!`,
      body: 'Tap to Fight!',
      url: '/games/streets-of-cambs-rage?join=1',
      tag: 'cambs-challenge',
    });

    return { ok: true };
  });

  // GET /api/games/cambs-rage/challenge — is someone challenging me?
  fastify.get('/api/games/cambs-rage/challenge', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const p = getPendingChallenge(accountId);
    return { incoming: !!p, from: p?.fromName ?? null };
  });

  // POST /api/games/cambs-rage/challenge/answer — challengee accepted.
  fastify.post('/api/games/cambs-rage/challenge/answer', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    pendingChallenges.delete(accountId);
    return { ok: true };
  });

  // POST /api/games/cambs-rage/challenge/cancel — challenger backed out.
  fastify.post('/api/games/cambs-rage/challenge/cancel', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });
    const { other } = await getPlayersFor(accountId);
    if (other) {
      const p = pendingChallenges.get(other.id);
      if (p?.fromId === accountId) pendingChallenges.delete(other.id);
    }
    return { ok: true };
  });

  fastify.post('/api/games/cambs-rage/win', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { difficulty = 'easy', matchId } = req.body ?? {};

    if (!matchId || typeof matchId !== 'string' || matchId.length > 64) {
      return reply.code(400).send({ error: 'matchId required' });
    }

    const pts    = PTS[difficulty] ?? PTS.easy;
    const reason = `cambs-rage:${difficulty}:${matchId}`;

    // Idempotency check — if this matchId was already credited, return silently
    const { rows } = await query(
      `SELECT 1 FROM points_ledger WHERE reason = $1 LIMIT 1`,
      [reason],
    );
    if (rows.length > 0) return { pts, alreadyClaimed: true };

    await creditPoints(accountId, pts, reason);
    return { pts, alreadyClaimed: false };
  });
}
