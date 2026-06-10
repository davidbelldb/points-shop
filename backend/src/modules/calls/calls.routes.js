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
import { pool } from '../../db.js';

const QUICK_ANSWER_MS = 10_000;
const QUICK_ANSWER_POINTS = 5;
const SUPER_RAIN_COST = 25;

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
  // Answering within QUICK_ANSWER_MS earns a small points bonus
  // (isolated transaction, same ledger pattern as the mini-games).
  fastify.post('/api/calls/answer', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const pending = getPending(accountId);
    pendingCalls.delete(accountId);

    let bonus = 0;
    if (pending && Date.now() - pending.at <= QUICK_ANSWER_MS) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE accounts SET points_balance = points_balance + $1, updated_at = NOW() WHERE id = $2`,
          [QUICK_ANSWER_POINTS, accountId],
        );
        await client.query(
          `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
          [accountId, QUICK_ANSWER_POINTS, 'sneakytime:quick-answer'],
        );
        await client.query('COMMIT');
        bonus = QUICK_ANSWER_POINTS;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        req.log.error({ err }, 'quick-answer bonus failed');
      } finally {
        client.release();
      }
    }

    return { ok: true, bonus };
  });

  // POST /api/calls/super-rain — charge points for a 100-duck downpour.
  fastify.post('/api/calls/super-rain', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    if (!accountId) return reply.code(401).send({ error: 'Not authenticated' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT points_balance FROM accounts WHERE id = $1 FOR UPDATE`,
        [accountId],
      );
      const balance = rows[0]?.points_balance ?? 0;
      if (balance < SUPER_RAIN_COST) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: `Super rain costs ${SUPER_RAIN_COST} pts (you have ${balance})` });
      }
      await client.query(
        `UPDATE accounts SET points_balance = points_balance - $1, updated_at = NOW() WHERE id = $2`,
        [SUPER_RAIN_COST, accountId],
      );
      await client.query(
        `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
        [accountId, -SUPER_RAIN_COST, 'sneakytime:super-rain'],
      );
      await client.query('COMMIT');
      return { ok: true, cost: SUPER_RAIN_COST, balance: balance - SUPER_RAIN_COST };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      req.log.error({ err }, 'super-rain charge failed');
      return reply.code(500).send({ error: 'Could not start super rain' });
    } finally {
      client.release();
    }
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
