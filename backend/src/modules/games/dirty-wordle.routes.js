/**
 * Dirty Wordle — server-side points award
 *
 * POST /api/games/dirty-wordle/win
 *   Body: { guesses: number (1-6), date: 'YYYY-MM-DD' }
 *
 * One award per account per day. Both users can win on the same day
 * (idempotency is per account_id + reason, not reason alone).
 *
 * Points: 1 guess=12, 2=10, 3=8, 4=6, 5=4, 6=2
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { creditPoints }          from './games.repo.js';
import { query }                 from '../../db.js';

const PTS_BY_GUESS = [12, 10, 8, 6, 4, 2];

export default async function dirtyWordleRoutes(fastify) {
  fastify.post('/api/games/dirty-wordle/win', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { guesses, date } = req.body ?? {};

    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    if (!Number.isInteger(guesses) || guesses < 1 || guesses > 6) {
      return reply.code(400).send({ error: 'guesses must be 1–6' });
    }

    const reason = `dirty-wordle:${date}`;
    const pts    = PTS_BY_GUESS[guesses - 1] ?? 2;

    // Per-account idempotency — both players can win the same daily word
    const { rows } = await query(
      `SELECT 1 FROM points_ledger WHERE reason = $1 AND account_id = $2 LIMIT 1`,
      [reason, accountId],
    );
    if (rows.length > 0) return { pts, alreadyClaimed: true };

    await creditPoints(accountId, pts, reason);
    return { pts, alreadyClaimed: false };
  });
}
