import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import {
  getPlayersFor, getActiveTtfGame, createTtfGame, getTtfGameById, updateTtfGame,
  getActiveMatch, getLatestFinishedMatch, getMatchById, createMatch, updateMatch,
  creditPoints, getTtfLeaderboard,
} from './games.repo.js';
import { sendPush } from '../notifications/push.js';

// ─── constants ────────────────────────────────────────────────────────────────
const LINES         = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const WINNER_BONUS  = 12;   // extra points for winning the global game
const MINI_WIN_PTS  = 8;    // points for winning a local board
const MINI_DRAW_PTS = 4;    // points each for a local board draw
const TOTAL_ROUNDS  = 1;    // one ultimate game = one match

// ─── helpers ──────────────────────────────────────────────────────────────────
/** Classic TTT check on a 9-cell board. Returns 'p1'|'p2'|'draw'|null. */
function evaluateLocal(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(Boolean)) return 'draw';
  return null;
}

/**
 * Check the global 9-cell board for an overall winner.
 * 'draw' cells act as wildcards for EITHER player.
 * A line only counts for a player if they could own all 3 cells (own or wildcard)
 * AND the opponent could NOT (to prevent all-wildcard lines from counting).
 */
function evaluateGlobal(globalBoard) {
  for (const [a, b, c] of LINES) {
    const cells = [globalBoard[a], globalBoard[b], globalBoard[c]];
    const p1 = cells.every(v => v === 'p1' || v === 'draw');
    const p2 = cells.every(v => v === 'p2' || v === 'draw');
    if (p1 && !p2) return 'p1';
    if (p2 && !p1) return 'p2';
  }
  if (globalBoard.every(v => v !== null)) return 'draw';
  return null;
}

/**
 * After a player plays cell `cellIndex` in a local board, the opponent must
 * play in global board `cellIndex` — unless that board is already resolved,
 * in which case the opponent may play anywhere (returns null).
 */
function nextActiveBoard(cellIndex, globalBoard) {
  return globalBoard[cellIndex] === null ? cellIndex : null;
}

/** Compute end-of-game points from the final global board. */
function computePoints(globalBoard, p1Id, p2Id, globalWinnerId) {
  const p1Wins  = globalBoard.filter(c => c === 'p1').length;
  const p2Wins  = globalBoard.filter(c => c === 'p2').length;
  const draws   = globalBoard.filter(c => c === 'draw').length;
  const p1Total = p1Wins * MINI_WIN_PTS + draws * MINI_DRAW_PTS + (globalWinnerId === p1Id ? WINNER_BONUS : 0);
  const p2Total = p2Wins * MINI_WIN_PTS + draws * MINI_DRAW_PTS + (globalWinnerId === p2Id ? WINNER_BONUS : 0);
  return { p1Total, p2Total };
}

async function notify(accountId, title, body) {
  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'game_turn', $2, $3, '/games/tic-tac-face')`,
    [accountId, title, body],
  );
  sendPush(accountId, { title, body, url: '/games/tic-tac-face' });
}

// ─── shapers ──────────────────────────────────────────────────────────────────
function shape(game, meId) {
  if (!game) return null;
  const youAre = game.p1_account_id === meId ? 'p1' : 'p2';
  const turn   = game.turn_account_id === game.p1_account_id ? 'p1' : 'p2';
  let winner = null;
  if (game.is_draw) winner = 'draw';
  else if (game.winner_account_id) winner = game.winner_account_id === game.p1_account_id ? 'p1' : 'p2';

  const localBoards = game.local_boards ?? Array(9).fill(null).map(() => Array(9).fill(null));
  const globalBoard = game.global_board ?? Array(9).fill(null);

  return {
    id:           game.id,
    local_boards: localBoards,
    global_board: globalBoard,
    active_board: game.active_board ?? null,
    you:          youAre,
    turn,
    winner,
    finished:     !!game.finished_at,
  };
}

function shapeMatch(match, meId) {
  if (!match) return null;
  const isMeP1    = match.p1_account_id === meId;
  const meWins    = isMeP1 ? match.p1_wins    : match.p2_wins;
  const otherWins = isMeP1 ? match.p2_wins    : match.p1_wins;
  const mePoints  = isMeP1 ? match.p1_points_awarded : match.p2_points_awarded;
  const otherPoints = isMeP1 ? match.p2_points_awarded : match.p1_points_awarded;
  let winner = null;
  if (match.finished_at) {
    if (!match.winner_account_id) winner = 'draw';
    else winner = match.winner_account_id === meId ? 'me' : 'other';
  }
  return {
    id:            match.id,
    total_rounds:  match.total_rounds,
    rounds_played: match.rounds_played,
    me_wins:       meWins,
    other_wins:    otherWins,
    draws:         match.draws,
    finished:      !!match.finished_at,
    winner,
    points_awarded: match.finished_at ? { me: mePoints, other: otherPoints, bonus: WINNER_BONUS } : null,
  };
}

async function finalizeMatch(match, globalBoard, globalWinnerId) {
  const { p1Total, p2Total } = computePoints(
    globalBoard, match.p1_account_id, match.p2_account_id, globalWinnerId,
  );
  const p1Wins = globalWinnerId === match.p1_account_id ? 1 : 0;
  const p2Wins = globalWinnerId === match.p2_account_id ? 1 : 0;
  const draws  = globalWinnerId ? 0 : 1;

  const matchPatch = {
    rounds_played:      1,
    p1_wins:            p1Wins,
    p2_wins:            p2Wins,
    draws,
    winner_account_id:  globalWinnerId ?? null,
    p1_points_awarded:  p1Total,
    p2_points_awarded:  p2Total,
    finished_at:        new Date(),
  };

  if (p1Total > 0) await creditPoints(match.p1_account_id, p1Total, `tic-tac-face:match-${match.id}`);
  if (p2Total > 0) await creditPoints(match.p2_account_id, p2Total, `tic-tac-face:match-${match.id}`);

  return updateMatch(match.id, matchPatch);
}

// ─── routes ───────────────────────────────────────────────────────────────────
export default async function gamesRoutes(fastify) {
  fastify.get('/api/games/players', async (req) => {
    const meId = getEffectiveAccountId(req);
    return getPlayersFor(meId);
  });

  fastify.get('/api/games/tic-tac-face/state', async (req) => {
    const meId   = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { players, game: null, match: null };
    let match = await getActiveMatch(meId, players.other.id);
    let matchToShow = match;
    if (!match) matchToShow = await getLatestFinishedMatch(meId, players.other.id);
    const game = match ? await getActiveTtfGame(meId, players.other.id) : null;
    return { players, game: shape(game, meId), match: shapeMatch(matchToShow, meId) };
  });

  fastify.post('/api/games/tic-tac-face/start', async (req, reply) => {
    const meId   = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });

    let match = await getActiveMatch(meId, players.other.id);
    const activeGame = match ? await getActiveTtfGame(meId, players.other.id) : null;
    if (activeGame) return { game: shape(activeGame, meId), match: shapeMatch(match, meId) };

    if (!match) {
      match = await createMatch(meId, players.other.id, TOTAL_ROUNDS);
      await notify(players.other.id, 'Ultimate Tic-tac-face', `${players.me.name} started a new game.`);
    }
    if (match.rounds_played >= match.total_rounds) {
      return reply.code(400).send({ error: 'Match already complete' });
    }

    const starterId = match.rounds_played % 2 === 0 ? match.p1_account_id : match.p2_account_id;
    const newGame   = await createTtfGame(match.id, match.p1_account_id, match.p2_account_id, starterId);
    if (starterId !== meId) {
      await notify(starterId, 'Ultimate Tic-tac-face', 'Your turn to start!');
    }
    return { game: shape(newGame, meId), match: shapeMatch(match, meId) };
  });

  fastify.post('/api/games/tic-tac-face/move', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { gameId, boardIndex, cellIndex } = req.body ?? {};

    if (!gameId
      || !Number.isInteger(boardIndex) || boardIndex < 0 || boardIndex > 8
      || !Number.isInteger(cellIndex)  || cellIndex  < 0 || cellIndex  > 8) {
      return reply.code(400).send({ error: 'gameId, boardIndex (0-8), and cellIndex (0-8) required' });
    }

    const game = await getTtfGameById(gameId);
    if (!game)            return reply.code(404).send({ error: 'Game not found' });
    if (game.finished_at) return reply.code(400).send({ error: 'Game already finished' });
    if (game.turn_account_id !== meId) return reply.code(403).send({ error: 'Not your turn' });

    const localBoards = (game.local_boards ?? Array(9).fill(null).map(() => Array(9).fill(null))).map(b => b.slice());
    const globalBoard = (game.global_board ?? Array(9).fill(null)).slice();
    const activeBoard = game.active_board ?? null;

    // Steering constraint
    if (activeBoard !== null && boardIndex !== activeBoard) {
      return reply.code(400).send({ error: `Must play in board ${activeBoard}` });
    }
    if (globalBoard[boardIndex] !== null) {
      return reply.code(400).send({ error: 'That board is already resolved' });
    }
    if (localBoards[boardIndex][cellIndex]) {
      return reply.code(400).send({ error: 'Cell already taken' });
    }

    const myMark    = game.p1_account_id === meId ? 'p1' : 'p2';
    const opponentId = game.p1_account_id === meId ? game.p2_account_id : game.p1_account_id;

    // Place the mark
    localBoards[boardIndex][cellIndex] = myMark;

    // Check local board result
    const localVerdict = evaluateLocal(localBoards[boardIndex]);
    if (localVerdict) {
      globalBoard[boardIndex] = localVerdict; // 'p1', 'p2', or 'draw'
    }

    // Check global result
    const globalVerdict = evaluateGlobal(globalBoard);

    const patch = {
      local_boards: JSON.stringify(localBoards),
      global_board: JSON.stringify(globalBoard),
    };

    let gameOver    = false;
    let opponentBody = 'Your turn!';

    if (globalVerdict) {
      gameOver = true;
      if (globalVerdict === 'draw') {
        patch.is_draw = true;
        opponentBody  = 'The game ended in a draw.';
      } else {
        patch.winner_account_id = globalVerdict === myMark ? meId : opponentId;
        opponentBody = globalVerdict === myMark ? 'You lost!' : 'You won!';
      }
      patch.finished_at   = new Date();
      patch.active_board  = null;
    } else {
      patch.turn_account_id = opponentId;
      patch.active_board    = nextActiveBoard(cellIndex, globalBoard);
    }

    const updated = await updateTtfGame(game.id, patch);

    // Finalize match if game is over
    let match = game.match_id ? await getMatchById(game.match_id) : null;
    if (gameOver && match && !match.finished_at) {
      const globalWinnerId = globalVerdict === 'draw' ? null
        : (globalVerdict === myMark ? meId : opponentId);
      match = await finalizeMatch(match, globalBoard, globalWinnerId);

      const winnerId = match.winner_account_id;
      if (winnerId) {
        await notify(opponentId, 'Ultimate Tic-tac-face', winnerId !== meId ? 'Game over — you won!' : 'Game over — you lost.');
      } else {
        await notify(opponentId, 'Ultimate Tic-tac-face', "Game over — it's a draw!");
      }
    } else if (!gameOver) {
      await notify(opponentId, 'Ultimate Tic-tac-face', opponentBody);
    }

    return { game: shape(updated, meId), match: shapeMatch(match, meId) };
  });

  fastify.post('/api/games/tic-tac-face/resign', async (req) => {
    const meId   = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { ok: true };

    const game = await getActiveTtfGame(meId, players.other.id);
    if (!game) return { ok: true };

    const opponentId = game.p1_account_id === meId ? game.p2_account_id : game.p1_account_id;
    await updateTtfGame(game.id, { winner_account_id: opponentId, finished_at: new Date() });

    let match = game.match_id ? await getMatchById(game.match_id) : null;
    if (match && !match.finished_at) {
      const globalBoard = game.global_board ?? Array(9).fill(null);
      match = await finalizeMatch(match, globalBoard, opponentId);
    }

    await notify(opponentId, 'Ultimate Tic-tac-face', `${players.me.name} resigned — you win!`);
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

  fastify.get('/api/games/tic-tac-face/leaderboard', async () => {
    return getTtfLeaderboard();
  });
}
