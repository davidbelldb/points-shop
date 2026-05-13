import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { startGame, endGame, getGame } from './stb.repo.js';

const WIN_BONUS = 48;

async function creditPts(accountId, delta, reason) {
  await query(
    `UPDATE accounts SET points_balance = points_balance + $1, updated_at = NOW() WHERE id = $2`,
    [delta, accountId],
  );
  await query(
    `INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`,
    [accountId, delta, reason],
  );
}

export default async function stbRoutes(fastify) {
  // State endpoint now just reports unlimited plays
  fastify.get('/api/games/shut-the-box/state', async () => {
    return { games_used_today: 0, games_limit: null, games_remaining: null };
  });

  fastify.post('/api/games/shut-the-box/start', async (req) => {
    const meId = getEffectiveAccountId(req);
    const game = await startGame(meId);
    return game;
  });

  fastify.post('/api/games/shut-the-box/end', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { game_id, result, final_tiles_open } = req.body ?? {};
    if (!game_id) return reply.code(400).send({ error: 'game_id required' });
    if (!['win', 'loss', 'abandoned'].includes(result)) return reply.code(400).send({ error: 'invalid result' });
    const game = await getGame(game_id);
    if (!game || game.account_id !== meId) return reply.code(404).send({ error: 'Game not found' });
    if (game.ended_at) return reply.code(400).send({ error: 'Game already ended' });
    await endGame(game_id, result, Array.isArray(final_tiles_open) ? final_tiles_open : []);
    let creditedPts = 0;
    if (result === 'win') {
      await creditPts(meId, WIN_BONUS, `shut-the-box:win-${game_id}`);
      creditedPts = WIN_BONUS;
    }
    return { ok: true, credited_pts: creditedPts };
  });
}
