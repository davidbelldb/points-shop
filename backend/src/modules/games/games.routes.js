import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  getPlayersFor, getActiveTtfGame, createTtfGame, getTtfGameById, updateTtfGame,
  getActiveMatch, getLatestFinishedMatch, getMatchById, createMatch, updateMatch,
  creditPoints,
} from './games.repo.js';
import { sendPush } from '../notifications/push.js';

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const WINNER_BONUS = 12;
const TOTAL_ROUNDS = 5;

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
  sendPush(accountId, { title, body, url: '/games/tic-tac-face' });
}

function shape(game, meId) {
  if (!game) return null;
  const youAre = game.p1_account_id === meId ? 'p1' : 'p2';
  const turn   = game.turn_account_id === game.p1_account_id ? 'p1' : 'p2';
  let winner = null;
  if (game.is_draw) winner = 'draw';
  else if (game.winner_account_id) winner = game.winner_account_id === game.p1_account_id ? 'p1' : 'p2';
  return { id: game.id, board: game.board, you: youAre, turn, winner, finished: !!game.finished_at };
}

function shapeMatch(match, meId) {
  if (!match) return null;
  const isMeP1 = match.p1_account_id === meId;
  const meWins = isMeP1 ? match.p1_wins : match.p2_wins;
  const otherWins = isMeP1 ? match.p2_wins : match.p1_wins;
  const mePoints = isMeP1 ? match.p1_points_awarded : match.p2_points_awarded;
  const otherPoints = isMeP1 ? match.p2_points_awarded : match.p1_points_awarded;
  let winner = null;
  if (match.finished_at) {
    if (!match.winner_account_id) winner = 'draw';
    else winner = match.winner_account_id === meId ? 'me' : 'other';
  }
  return {
    id: match.id,
    total_rounds: match.total_rounds,
    rounds_played: match.rounds_played,
    me_wins: meWins,
    other_wins: otherWins,
    draws: match.draws,
    finished: !!match.finished_at,
    winner,
    points_awarded: match.finished_at ? { me: mePoints, other: otherPoints, bonus: WINNER_BONUS } : null,
  };
}

async function finalizeMatchIfDone(match, matchPatch) {
  const p1Wins = matchPatch.p1_wins ?? match.p1_wins;
  const p2Wins = matchPatch.p2_wins ?? match.p2_wins;
  const roundsPlayed = matchPatch.rounds_played;
  if (roundsPlayed < match.total_rounds) return matchPatch;
  let winnerId = null;
  if (p1Wins > p2Wins) winnerId = match.p1_account_id;
  else if (p2Wins > p1Wins) winnerId = match.p2_account_id;
  matchPatch.winner_account_id = winnerId;
  matchPatch.finished_at = new Date();
  const p1Points = p1Wins + (winnerId === match.p1_account_id ? WINNER_BONUS : 0);
  const p2Points = p2Wins + (winnerId === match.p2_account_id ? WINNER_BONUS : 0);
  matchPatch.p1_points_awarded = p1Points;
  matchPatch.p2_points_awarded = p2Points;
  if (p1Points > 0) await creditPoints(match.p1_account_id, p1Points, `tic-tac-face:match-${match.id}`);
  if (p2Points > 0) await creditPoints(match.p2_account_id, p2Points, `tic-tac-face:match-${match.id}`);
  return matchPatch;
}

export default async function gamesRoutes(fastify) {
  fastify.get('/api/games/players', async (req) => {
    const meId = getEffectiveAccountId(req);
    return getPlayersFor(meId);
  });

  fastify.get('/api/games/tic-tac-face/state', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { players, game: null, match: null };
    let match = await getActiveMatch(meId, players.other.id);
    let matchToShow = match;
    if (!match) matchToShow = await getLatestFinishedMatch(meId, players.other.id);
    const game = match ? await getActiveTtfGame(meId, players.other.id) : null;
    return { players, game: shape(game, meId), match: shapeMatch(matchToShow, meId) };
  });

  fastify.post('/api/games/tic-tac-face/start', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });

    let match = await getActiveMatch(meId, players.other.id);
    const activeGame = match ? await getActiveTtfGame(meId, players.other.id) : null;
    if (activeGame) return { game: shape(activeGame, meId), match: shapeMatch(match, meId) };

    if (!match) {
      match = await createMatch(meId, players.other.id, TOTAL_ROUNDS);
      await notify(players.other.id, 'Tic-tac-face', `${players.me.name} started a new match.`);
    }
    if (match.rounds_played >= match.total_rounds) {
      return reply.code(400).send({ error: 'Match already complete' });
    }

    const starterId = match.rounds_played % 2 === 0 ? match.p1_account_id : match.p2_account_id;
    const newGame = await createTtfGame(match.id, match.p1_account_id, match.p2_account_id, starterId);
    if (starterId !== meId) {
      await notify(starterId, 'Tic-tac-face', 'Your turn to start the round!');
    }
    return { game: shape(newGame, meId), match: shapeMatch(match, meId) };
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
    let roundEnded = false;
    if (verdict.winner === 'draw') {
      patch.is_draw = true; patch.finished_at = new Date();
      opponentBody = 'Round drawn.'; roundEnded = true;
    } else if (verdict.winner) {
      patch.winner_account_id = meId; patch.finished_at = new Date();
      opponentBody = 'You lost the round.'; roundEnded = true;
    } else {
      patch.turn_account_id = opponentId;
    }
    const updated = await updateTtfGame(game.id, patch);

    let match = game.match_id ? await getMatchById(game.match_id) : null;
    if (roundEnded && match && !match.finished_at) {
      const isMeP1 = match.p1_account_id === meId;
      let matchPatch = { rounds_played: match.rounds_played + 1, p1_wins: match.p1_wins, p2_wins: match.p2_wins, draws: match.draws };
      if (verdict.winner === 'draw') matchPatch.draws = match.draws + 1;
      else if (isMeP1)               matchPatch.p1_wins = match.p1_wins + 1;
      else                            matchPatch.p2_wins = match.p2_wins + 1;
      matchPatch = await finalizeMatchIfDone(match, matchPatch);
      match = await updateMatch(match.id, matchPatch);
    }

    if (roundEnded && match?.finished_at) {
      const winnerId = match.winner_account_id;
      if (winnerId) {
        const opponentWon = winnerId !== meId;
        await notify(opponentId, 'Tic-tac-face', opponentWon ? 'Match over - you won!' : 'Match over - you lost.');
      } else {
        await notify(opponentId, 'Tic-tac-face', "Match over - it's a tie!");
      }
    } else {
      await notify(opponentId, 'Tic-tac-face', opponentBody);
    }

    return { game: shape(updated, meId), match: shapeMatch(match, meId) };
  });

  fastify.post('/api/games/tic-tac-face/resign', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { ok: true };
    const game = await getActiveTtfGame(meId, players.other.id);
    if (!game) return { ok: true };
    const opponentId = game.p1_account_id === meId ? game.p2_account_id : game.p1_account_id;
    await updateTtfGame(game.id, { winner_account_id: opponentId, finished_at: new Date() });

    let match = game.match_id ? await getMatchById(game.match_id) : null;
    if (match && !match.finished_at) {
      const isMeP1 = match.p1_account_id === meId;
      let matchPatch = {
        rounds_played: match.rounds_played + 1,
        p1_wins: match.p1_wins + (isMeP1 ? 0 : 1),
        p2_wins: match.p2_wins + (isMeP1 ? 1 : 0),
        draws: match.draws,
      };
      matchPatch = await finalizeMatchIfDone(match, matchPatch);
      match = await updateMatch(match.id, matchPatch);
    }
    await notify(opponentId, 'Tic-tac-face', `${players.me.name} resigned the round.`);
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
