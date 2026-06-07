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
import { creditPoints }          from './games.repo.js';
import { query }                 from '../../db.js';

const PTS = { easy: 4, medium: 8, hard: 12 };

export default async function cambsRageRoutes(fastify) {
  fastify.post('/api/games/cambs-rage/win', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { difficulty = 'easy', matchId } = req.body ?? {};

    if (!matchId || typeof matchId !== 'string' || matchId.length > 64) {
      return reply.code(400).send({ error: 'matchId required' });
    }

    const pts    = PTS[difficulty] ?? PTS.easy;
    const reason = `cambs-rage:${matchId}`;

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
