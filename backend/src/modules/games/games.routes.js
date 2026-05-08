import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  getPlayersFor, getActiveTtfGame, createTtfGame,
  getTtfGameById, updateTtfGame, getTtfScores,
} from './games.repo.js';

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];
function evaluate(board) {
  for (const line of LINES) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(Boolean)) return { winner: 'draw', line: null };
  return { winner: null, line: null };
}
async function notify(accountId, title, body) {
  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'game_turn', $2, $3, '/games/tic-tac-face')`,
    [accountId, title, body],
  );
}
function shape(game, meId) {
  if (!game) return null;
  const youAre = game.p1_account_id === meId ? 'p1' : 'p2';
  const turn   = game.turn_account_id === game.p1_account_id ? 'p1' : 'p2';
  let winner = null;
  if (game.is_draw) winner = 'draw';
  else if (game.winner_account_id) winner = game.winner_account_id === game.p1_account_id ? 'p1' : 'p2';
  return {
    id: game.id,
    board: game.board,
    you: youAre,
    turn,
    winner,
    finished: !!game.finished_at,
  };
}

export default async function gamesRoutes(fastify) {
  fastify.get('/api/games/players', async (req) => {
    const meId = getEffectiveAccountId(req);
    return getPlayersFor(meId);
  });

  fastify.get('/api/games/tic-tac-face/state', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { players, game: null, scores: { me: 0, other: 0, draws: 0 } };
    const game = await getActiveTtfGame(meId, players.other.id);
    const s    = await getTtfScores(meId, players.other.id);
    return {
      players,
      game: shape(game, meId),
      scores: { me: s.me_wins ?? 0, other: s.other_wins ?? 0, draws: s.draws ?? 0 },
    };
  });

  fastify.post('/api/games/tic-tac-face/start', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    let game = await getActiveTtfGame(meId, players.other.id);
    if (!game) {
      game = await createTtfGame(meId, players.other.id);
      await notify(players.other.id, 'Tic-tac-face', `${players.me.name} started a game.`);
    }
    return shape(game, meId);
  });

  fastify.post('/api/games/tic-tac-face/move', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { gameId, index } = req.body ?? {};
    if (!gameId || !Number.isInteger(index) || index < 0 || index > 8) {
      return reply.code(400).send({ error: 'gameId and index 0-8 required' });
    }
    const game = await getTtfGameById(gameId);
    if (!game) return reply.code(404).send({ error: 'Game not found' });
    if (game.finished_at) return reply.code(400).send({ error: 'Game finished' });
    if (game.turn_account_id !== meId) return reply.code(403).send({ error: 'Not your turn' });
    const board = Array.isArray(game.board) ? game.board.slice() : Array(9).fill(null);
    if (board[index]) return reply.code(400).send({ error: 'Cell already taken' });
    const myMark = game.p1_account_id === meId ? 'p1' : 'p2';
    board[index] = myMark;
    const verdict = evaluate(board);
    const opponentId = game.p1_account_id === meId ? game.p2_account_id : game.p1_account_id;
    const patch = { board: JSON.stringify(board) };
    let opponentBody = 'Your turn!';
    if (verdict.winner === 'draw') {
      patch.is_draw = true;
      patch.finished_at = new Date();
      opponentBody = 'Draw. Rematch?';
    } else if (verdict.winner) {
      patch.winner_account_id = meId;
      patch.finished_at = new Date();
      opponentBody = 'You lost. Rematch?';
    } else {
      patch.turn_account_id = opponentId;
    }
    const updated = await updateTtfGame(game.id, patch);
    await notify(opponentId, 'Tic-tac-face', opponentBody);
    return shape(updated, meId);
  });

  fastify.post('/api/games/tic-tac-face/resign', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { ok: true };
    const game = await getActiveTtfGame(meId, players.other.id);
    if (!game) return { ok: true };
    const opponentId = game.p1_account_id === meId ? game.p2_account_id : game.p1_account_id;
    await updateTtfGame(game.id, { winner_account_id: opponentId, finished_at: new Date() });
    await notify(opponentId, 'Tic-tac-face', `${players.me.name} resigned. You win!`);
    return { ok: true };
  });

  fastify.post('/api/games/tic-tac-face/mark-read', async (req) => {
    const meId = getEffectiveAccountId(req);
    await query(
      `UPDATE notifications SET read_at = NOW()
        WHERE account_id = $1 AND type = 'game_turn' AND read_at IS NULL`,
      [meId],
    );
    return { ok: true };
  });
}
