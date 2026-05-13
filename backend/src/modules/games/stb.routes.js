import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { countGamesToday, startGame, endGame, getGame, insertTrophy, listTrophies } from './stb.repo.js';

const WIN_BONUS = 48;
const DAILY_LIMIT = 5;

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
  fastify.get('/api/games/shut-the-box/state', async (req) => {
    const meId = getEffectiveAccountId(req);
    const role = req.user?.actualRole;
    const used = role === 'admin' ? 0 : await countGamesToday(meId);
    const remaining = role === 'admin' ? null : Math.max(0, DAILY_LIMIT - used);
    return { games_used_today: used, games_limit: role === 'admin' ? null : DAILY_LIMIT, games_remaining: remaining };
  });

  fastify.post('/api/games/shut-the-box/start', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const role = req.user?.actualRole;
    if (role !== 'admin') {
      const used = await countGamesToday(meId);
      if (used >= DAILY_LIMIT) {
        return reply.code(429).send({ error: 'Daily limit reached. Come back tomorrow.' });
      }
    }
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
    let trophy = null;
    let creditedPts = 0;
    if (result === 'win') {
      trophy = await insertTrophy(meId, game_id);
      await creditPts(meId, WIN_BONUS, `shut-the-box:win-${game_id}`);
      creditedPts = WIN_BONUS;
    }
    return { ok: true, trophy, credited_pts: creditedPts };
  });

  fastify.get('/api/account/trophies', async (req) => {
    const meId = getEffectiveAccountId(req);
    return listTrophies(meId);
  });
}
