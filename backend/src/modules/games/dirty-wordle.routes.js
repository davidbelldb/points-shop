/**
 * Dirty Wordle — backend routes
 *
 * POST /api/games/dirty-wordle/result
 *   Body: { date, won, guesses_taken, guess_grid }
 *   Saves result + credits points on win (idempotent per account+date).
 *
 * GET /api/games/dirty-wordle/leaderboard?date=YYYY-MM-DD
 *   Returns today's grids for both players + all-time stats.
 *
 * Points: 1=44, 2=36, 3=28, 4=16, 5=8, 6=4
 */

import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { creditPoints }          from './games.repo.js';
import { query }                 from '../../db.js';

const PTS_BY_GUESS = [44, 36, 28, 16, 8, 4];

export default async function dirtyWordleRoutes(fastify) {

  // ── Save result (win or loss) + credit points on win ──────────────────────
  fastify.post('/api/games/dirty-wordle/result', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { date, won, guesses_taken, guess_grid, guesses } = req.body ?? {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    if (typeof won !== 'boolean') {
      return reply.code(400).send({ error: 'won (boolean) required' });
    }
    if (!Number.isInteger(guesses_taken) || guesses_taken < 1 || guesses_taken > 6) {
      return reply.code(400).send({ error: 'guesses_taken must be 1–6' });
    }
    if (!Array.isArray(guess_grid) || guess_grid.length === 0) {
      return reply.code(400).send({ error: 'guess_grid array required' });
    }

    // Upsert result row — idempotent, first write wins
    await query(
      `INSERT INTO dirty_wordle_results (account_id, date, won, guesses_taken, guess_grid, guesses)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (account_id, date) DO UPDATE SET guesses = EXCLUDED.guesses`,
      [accountId, date, won, guesses_taken, JSON.stringify(guess_grid), JSON.stringify(guesses ?? [])],
    );

    // Credit points on win (also idempotent via ledger reason)
    let pts = 0;
    let alreadyClaimed = false;
    if (won) {
      const reason = `dirty-wordle:${date}`;
      pts = PTS_BY_GUESS[guesses_taken - 1] ?? 4;
      const { rows } = await query(
        `SELECT 1 FROM points_ledger WHERE reason = $1 AND account_id = $2 LIMIT 1`,
        [reason, accountId],
      );
      if (rows.length > 0) {
        alreadyClaimed = true;
      } else {
        await creditPoints(accountId, pts, reason);
      }
    }

    return { pts, alreadyClaimed };
  });

  // ── Leaderboard ───────────────────────────────────────────────────────────
  fastify.get('/api/games/dirty-wordle/leaderboard', async (req) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);

    // Today's results for all accounts
    const { rows: todayRows } = await query(
      `SELECT r.account_id, r.won, r.guesses_taken, r.guess_grid,
              a.name, a.photo_url,
              pl.delta AS pts
         FROM dirty_wordle_results r
         JOIN accounts a ON a.id = r.account_id
         LEFT JOIN points_ledger pl
           ON pl.account_id = r.account_id
          AND pl.reason = $1
        WHERE r.date = $2
        ORDER BY r.guesses_taken ASC, r.created_at ASC`,
      [`dirty-wordle:${date}`, date],
    );

    // All-time stats per account
    const { rows: statsRows } = await query(
      `SELECT r.account_id,
              a.name,
              a.photo_url,
              COUNT(*)                              AS games_played,
              COUNT(*) FILTER (WHERE r.won)         AS wins,
              ROUND(AVG(r.guesses_taken)::numeric, 1) AS avg_guesses,
              COALESCE(SUM(pl.delta), 0)            AS total_pts
         FROM dirty_wordle_results r
         JOIN accounts a ON a.id = r.account_id
         LEFT JOIN points_ledger pl
           ON pl.account_id = r.account_id
          AND pl.reason = 'dirty-wordle:' || r.date::text
          AND r.won = true
        GROUP BY r.account_id, a.name, a.photo_url
        ORDER BY wins DESC, avg_guesses ASC`,
    );

    return {
      date,
      today: todayRows.map(r => ({
        name:         r.name,
        photo_url:    r.photo_url,
        won:          r.won,
        guesses_taken: r.guesses_taken,
        guess_grid:   r.guess_grid,
        pts:          Number(r.pts ?? 0),
      })),
      allTime: statsRows.map(r => ({
        name:          r.name,
        photo_url:     r.photo_url,
        games_played:  Number(r.games_played),
        wins:          Number(r.wins),
        avg_guesses:   Number(r.avg_guesses),
        total_pts:     Number(r.total_pts),
      })),
    };
  });

  // ── Save in-progress guesses (mid-game persistence) ──────────────────────
  fastify.get('/api/games/dirty-wordle/progress', async (req) => {
    const accountId = getEffectiveAccountId(req);
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);

    // Check in-progress first
    const { rows: progressRows } = await query(
      `SELECT guesses FROM dirty_wordle_progress WHERE account_id = $1 AND date = $2`,
      [accountId, date],
    );
    if (progressRows[0]?.guesses?.length > 0) {
      return { guesses: progressRows[0].guesses };
    }

    // Fall back to completed result (permanent record) if progress is gone
    const { rows: resultRows } = await query(
      `SELECT guesses FROM dirty_wordle_results WHERE account_id = $1 AND date = $2`,
      [accountId, date],
    );
    return { guesses: resultRows[0]?.guesses ?? [] };
  });

  fastify.post('/api/games/dirty-wordle/progress', async (req, reply) => {
    const accountId = getEffectiveAccountId(req);
    const { date, guesses } = req.body ?? {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: 'date required (YYYY-MM-DD)' });
    }
    if (!Array.isArray(guesses)) {
      return reply.code(400).send({ error: 'guesses array required' });
    }
    await query(
      `INSERT INTO dirty_wordle_progress (account_id, date, guesses, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (account_id, date)
       DO UPDATE SET guesses = EXCLUDED.guesses, updated_at = NOW()`,
      [accountId, date, JSON.stringify(guesses)],
    );
    return { ok: true };
  });

  // ── Legacy /win kept for backwards compat (redirects to /result) ──────────
  fastify.post('/api/games/dirty-wordle/win', async (req, reply) => {
    return reply.code(410).send({ error: 'Use POST /api/games/dirty-wordle/result' });
  });
}
