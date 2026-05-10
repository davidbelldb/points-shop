import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { getPlayersFor } from './games.repo.js';
import {
  getActiveGsMatch, createGsMatch, updateGsMatch,
  listGsItems, deleteGsItemsForOwner, deleteGsItemById, insertGsItem,
} from './giftsweeper.repo.js';

const DEFAULT_ROWS = 6, DEFAULT_COLS = 6, DEFAULT_COST = 1, MIN_ITEMS = 3;

function isContiguous(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  if (cells.length === 1) return true;
  const set = new Set(cells.map((c) => `${c.r}-${c.c}`));
  const visited = new Set();
  const start = `${cells[0].r}-${cells[0].c}`;
  visited.add(start);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift();
    const [r, c] = k.split('-').map(Number);
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nk = `${r+dr}-${c+dc}`;
      if (set.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
    }
  }
  return visited.size === cells.length;
}
function isValidPlacement(cells, rows, cols) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  for (const c of cells) {
    if (!Number.isInteger(c.r) || !Number.isInteger(c.c)) return false;
    if (c.r < 0 || c.r >= rows || c.c < 0 || c.c >= cols) return false;
  }
  return isContiguous(cells);
}
function cellsOverlap(a, b) {
  for (const ca of a) for (const cb of b) if (ca.r === cb.r && ca.c === cb.c) return true;
  return false;
}
async function notifyGs(accountId, title, body) {
  await query(
    `INSERT INTO notifications (account_id, type, title, body, link_url)
     VALUES ($1, 'gs_turn', $2, $3, '/games/giftsweeper')`,
    [accountId, title, body],
  );
}
async function getBalance(accountId) {
  const r = await query(`SELECT points_balance FROM accounts WHERE id = $1`, [accountId]);
  return r.rows[0]?.points_balance ?? 0;
}
function shapeMatch(match, meId, extras = {}) {
  if (!match) return null;
  const isInitiator = match.initiator_account_id === meId;
  return {
    id: match.id,
    grid_rows: match.grid_rows, grid_cols: match.grid_cols,
    cost_per_cell: match.cost_per_cell,
    you_are: isInitiator ? 'initiator' : 'opponent',
    my_setup_done:    isInitiator ? match.initiator_setup_done : match.opponent_setup_done,
    other_setup_done: isInitiator ? match.opponent_setup_done : match.initiator_setup_done,
    started: match.initiator_setup_done && match.opponent_setup_done,
    current_turn_is_me: match.current_turn_account_id === meId,
    finished: !!match.finished_at,
    ...extras,
  };
}

export default async function giftsweeperRoutes(fastify) {
  fastify.get('/api/games/giftsweeper/state', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { players, match: null, my_items: [] };
    let match = await getActiveGsMatch(meId, players.other.id);
    if (!match) {
      const r = await query(
        `SELECT * FROM giftsweeper_matches
          WHERE finished_at IS NOT NULL
            AND ((initiator_account_id = $1 AND opponent_account_id = $2)
              OR (initiator_account_id = $2 AND opponent_account_id = $1))
          ORDER BY finished_at DESC LIMIT 1`,
        [meId, players.other.id],
      );
      match = r.rows[0] ?? null;
    }
    if (!match) return { players, match: null, my_items: [] };

    const myItems = await listGsItems(match.id, meId);
    if (!match.initiator_setup_done || !match.opponent_setup_done) {
      return { players, match: shapeMatch(match, meId), my_items: myItems };
    }

    const opponentId = match.initiator_account_id === meId ? match.opponent_account_id : match.initiator_account_id;
    const oppItems = await listGsItems(match.id, opponentId);

    const myGuessRows = (await query(
      `SELECT cell_row, cell_col, hit_item_id FROM giftsweeper_guesses WHERE match_id = $1 AND guesser_account_id = $2`,
      [match.id, meId],
    )).rows;
    const oppGuessRows = (await query(
      `SELECT cell_row, cell_col, hit_item_id FROM giftsweeper_guesses WHERE match_id = $1 AND guesser_account_id = $2`,
      [match.id, opponentId],
    )).rows;

    const myHitsByItem = {}; for (const g of myGuessRows) if (g.hit_item_id) myHitsByItem[g.hit_item_id] = (myHitsByItem[g.hit_item_id]||0)+1;
    const oppHitsByItem = {}; for (const g of oppGuessRows) if (g.hit_item_id) oppHitsByItem[g.hit_item_id] = (oppHitsByItem[g.hit_item_id]||0)+1;

    const oppGridGuesses = myGuessRows.map((g) => {
      const item = g.hit_item_id ? oppItems.find((it) => it.id === g.hit_item_id) : null;
      const itemRevealed = item ? (myHitsByItem[item.id]||0) >= (item.cells||[]).length : false;
      return {
        r: g.cell_row, c: g.cell_col, hit: !!g.hit_item_id,
        item_id: g.hit_item_id,
        item_revealed: itemRevealed,
        item_kind: itemRevealed && item ? (item.product_id ? 'product' : 'forfeit') : null,
        item_label: itemRevealed && item ? (item.product_name || item.text_label) : null,
      };
    });
    const myGridMarks = oppGuessRows.map((g) => ({ r: g.cell_row, c: g.cell_col, hit: !!g.hit_item_id }));

    const myItemsRevealedByOpp = myItems.filter((it) => (oppHitsByItem[it.id]||0) >= (it.cells||[]).length).length;
    const oppItemsRevealedByMe = oppItems.filter((it) => (myHitsByItem[it.id]||0) >= (it.cells||[]).length).length;
    const balance = await getBalance(meId);

    return {
      players,
      match: shapeMatch(match, meId, { my_balance: balance }),
      my_items: myItems,
      opp_grid: { rows: match.grid_rows, cols: match.grid_cols, guesses: oppGridGuesses, items_total: oppItems.length, items_revealed: oppItemsRevealedByMe },
      my_grid:  { marks: myGridMarks, items_total: myItems.length, items_revealed: myItemsRevealedByOpp },
    };
  });

  fastify.post('/api/games/giftsweeper/start', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    let match = await getActiveGsMatch(meId, players.other.id);
    if (match) return shapeMatch(match, meId);
    const body = req.body ?? {};
    const rows = Math.min(Math.max(parseInt(body.grid_rows ?? DEFAULT_ROWS, 10), 3), 10);
    const cols = Math.min(Math.max(parseInt(body.grid_cols ?? DEFAULT_COLS, 10), 3), 10);
    const cost = Math.max(parseInt(body.cost_per_cell ?? DEFAULT_COST, 10), 1);
    match = await createGsMatch(meId, players.other.id, rows, cols, cost);
    await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} started a Giftsweeper match. Set up your grid!`);
    return shapeMatch(match, meId);
  });

  fastify.post('/api/games/giftsweeper/item', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { product_id, text_label, cells } = req.body ?? {};
    if (!Array.isArray(cells) || cells.length === 0) return reply.code(400).send({ error: 'cells required' });
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    const isInitiator = match.initiator_account_id === meId;
    if (isInitiator ? match.initiator_setup_done : match.opponent_setup_done) {
      return reply.code(400).send({ error: 'Setup already confirmed' });
    }
    if (!isValidPlacement(cells, match.grid_rows, match.grid_cols)) {
      return reply.code(400).send({ error: 'Item placements cannot contain gaps.' });
    }
    if (isInitiator && !product_id) return reply.code(400).send({ error: 'Pick a product' });
    if (!isInitiator && !text_label?.trim()) return reply.code(400).send({ error: 'Enter a forfeit description' });
    const existing = await listGsItems(match.id, meId);
    for (const ex of existing) if (cellsOverlap(ex.cells, cells)) return reply.code(400).send({ error: 'Cells overlap an existing item' });
    return await insertGsItem(match.id, meId, isInitiator ? product_id : null, isInitiator ? null : text_label.trim(), cells);
  });

  fastify.delete('/api/games/giftsweeper/item/:id', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    const isInitiator = match.initiator_account_id === meId;
    if (isInitiator ? match.initiator_setup_done : match.opponent_setup_done) {
      return reply.code(400).send({ error: 'Setup already confirmed; cannot edit items' });
    }
    await deleteGsItemById(req.params.id, meId);
    return { ok: true };
  });

  fastify.post('/api/games/giftsweeper/items', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { items } = req.body ?? {};
    if (!Array.isArray(items)) return reply.code(400).send({ error: 'items array required' });
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    const isInitiator = match.initiator_account_id === meId;
    if (isInitiator ? match.initiator_setup_done : match.opponent_setup_done) return reply.code(400).send({ error: 'Setup already confirmed' });
    if (items.length < MIN_ITEMS) return reply.code(400).send({ error: `At least ${MIN_ITEMS} items required` });
    const seen = [];
    for (const [idx, it] of items.entries()) {
      if (!isValidPlacement(it.cells, match.grid_rows, match.grid_cols)) return reply.code(400).send({ error: `Item ${idx+1}: item placements cannot contain gaps.` });
      for (const prev of seen) if (cellsOverlap(prev, it.cells)) return reply.code(400).send({ error: `Item ${idx+1} overlaps another item` });
      seen.push(it.cells);
    }
    await deleteGsItemsForOwner(match.id, meId);
    for (const it of items) {
      await insertGsItem(match.id, meId, isInitiator ? it.product_id : null, isInitiator ? null : it.text_label?.trim() || null, it.cells);
    }
    return { ok: true };
  });

  fastify.post('/api/games/giftsweeper/confirm', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    const items = await listGsItems(match.id, meId);
    if (items.length < MIN_ITEMS) return reply.code(400).send({ error: `At least ${MIN_ITEMS} items required to confirm` });
    const isInitiator = match.initiator_account_id === meId;
    let updated = await updateGsMatch(match.id, isInitiator ? { initiator_setup_done: true } : { opponent_setup_done: true });
    if (updated.initiator_setup_done && updated.opponent_setup_done) {
      updated = await updateGsMatch(updated.id, { current_turn_account_id: updated.initiator_account_id });
      const initiatorId = updated.initiator_account_id;
      if (initiatorId === meId) {
        await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} confirmed their grid. Match is on - they go first.`);
      } else {
        await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} confirmed their grid. Your turn - go first!`);
      }
    } else {
      await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} confirmed their grid. Yours next!`);
    }
    return shapeMatch(updated, meId);
  });

  fastify.post('/api/games/giftsweeper/abandon', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { ok: true };
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return { ok: true };
    await updateGsMatch(match.id, { finished_at: new Date(), current_turn_account_id: null });
    await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} cancelled the match.`);
    return { ok: true };
  });

  fastify.post('/api/games/giftsweeper/grovel', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    if (match.finished_at) return reply.code(400).send({ error: 'Match already finished' });
    await updateGsMatch(match.id, { finished_at: new Date(), current_turn_account_id: null });
    await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} grovelled out. Match over.`);
    return { ok: true };
  });

  fastify.post('/api/games/giftsweeper/guess', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { cells } = req.body ?? {};
    if (!Array.isArray(cells) || cells.length === 0) return reply.code(400).send({ error: 'cells required' });
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    if (!match.initiator_setup_done || !match.opponent_setup_done) return reply.code(400).send({ error: 'Both players must finish setup' });
    if (match.finished_at) return reply.code(400).send({ error: 'Match finished' });
    if (match.current_turn_account_id !== meId) return reply.code(403).send({ error: 'Not your turn' });

    const seen = new Set();
    for (const cell of cells) {
      if (!Number.isInteger(cell.r) || !Number.isInteger(cell.c)) return reply.code(400).send({ error: 'Invalid cell' });
      if (cell.r < 0 || cell.r >= match.grid_rows || cell.c < 0 || cell.c >= match.grid_cols) return reply.code(400).send({ error: 'Cell out of grid' });
      const k = `${cell.r}-${cell.c}`;
      if (seen.has(k)) return reply.code(400).send({ error: 'Duplicate cell' });
      seen.add(k);
    }
    const existing = (await query(
      `SELECT cell_row, cell_col FROM giftsweeper_guesses WHERE match_id = $1 AND guesser_account_id = $2`,
      [match.id, meId],
    )).rows;
    const existSet = new Set(existing.map((g) => `${g.cell_row}-${g.cell_col}`));
    for (const c of cells) if (existSet.has(`${c.r}-${c.c}`)) return reply.code(400).send({ error: 'Cell already guessed' });

    const cost = cells.length * (match.cost_per_cell || 1);
    const balance = await getBalance(meId);
    if (balance < cost) return reply.code(400).send({ error: `Insufficient points (need ${cost}, have ${balance})` });

    await query(`UPDATE accounts SET points_balance = points_balance - $1, updated_at = NOW() WHERE id = $2`, [cost, meId]);
    await query(`INSERT INTO points_ledger (account_id, delta, reason) VALUES ($1, $2, $3)`, [meId, -cost, `giftsweeper:turn-${match.id}`]);

    const opponentId = match.initiator_account_id === meId ? match.opponent_account_id : match.initiator_account_id;
    const oppItems = await listGsItems(match.id, opponentId);

    const before = (await query(
      `SELECT hit_item_id, COUNT(*)::int AS c FROM giftsweeper_guesses
        WHERE match_id = $1 AND guesser_account_id = $2 AND hit_item_id IS NOT NULL GROUP BY hit_item_id`,
      [match.id, meId],
    )).rows;
    const beforeByItem = {}; for (const r of before) beforeByItem[r.hit_item_id] = r.c;

    const turnNumber = (await query(
      `SELECT COALESCE(MAX(turn_number), 0) + 1 AS n FROM giftsweeper_guesses WHERE match_id = $1`,
      [match.id],
    )).rows[0].n;

    const results = []; const thisTurnByItem = {};
    for (const cell of cells) {
      const hitItem = oppItems.find((it) => (it.cells || []).some((c) => c.r === cell.r && c.c === cell.c)) || null;
      await query(
        `INSERT INTO giftsweeper_guesses (match_id, guesser_account_id, cell_row, cell_col, hit_item_id, turn_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [match.id, meId, cell.r, cell.c, hitItem?.id || null, turnNumber],
      );
      if (hitItem) thisTurnByItem[hitItem.id] = (thisTurnByItem[hitItem.id]||0) + 1;
      results.push({ r: cell.r, c: cell.c, hit: !!hitItem, item_id: hitItem?.id || null });
    }

    const newlyWon = [];
    for (const itemId of Object.keys(thisTurnByItem)) {
      const item = oppItems.find((it) => it.id === itemId);
      if (!item) continue;
      const total = (item.cells || []).length;
      const beforeCount = beforeByItem[itemId] || 0;
      const after = beforeCount + thisTurnByItem[itemId];
      if (beforeCount < total && after >= total) {
        newlyWon.push({
          id: item.id,
          kind: item.product_id ? 'product' : 'forfeit',
          label: item.product_name || item.text_label,
          thumbnail: item.product_thumbnail || null,
        });
        await query(
          `INSERT INTO game_rewards (account_id, source_type, source_id, product_id, text_label)
           VALUES ($1, 'giftsweeper', $2, $3, $4)`,
          [meId, match.id, item.product_id || null, item.text_label || null],
        );
      }
      for (const r of results) {
        if (r.item_id === itemId) {
          r.item_revealed = after >= total;
          if (r.item_revealed) { r.item_kind = item.product_id ? 'product' : 'forfeit'; r.item_label = item.product_name || item.text_label; }
        }
      }
    }

    const myItems = await listGsItems(match.id, meId);
    const oppHits = (await query(
      `SELECT hit_item_id, COUNT(*)::int AS c FROM giftsweeper_guesses
        WHERE match_id = $1 AND guesser_account_id = $2 AND hit_item_id IS NOT NULL GROUP BY hit_item_id`,
      [match.id, opponentId],
    )).rows;
    const oppHitsByItem = {}; for (const r of oppHits) oppHitsByItem[r.hit_item_id] = r.c;
    const myAllRevealed = myItems.every((it) => (oppHitsByItem[it.id]||0) >= (it.cells||[]).length);
    const oppAllRevealed = oppItems.every((it) => ((beforeByItem[it.id]||0) + (thisTurnByItem[it.id]||0)) >= (it.cells||[]).length);
    const matchFinished = myAllRevealed && oppAllRevealed;

    if (matchFinished) {
      await updateGsMatch(match.id, { finished_at: new Date(), current_turn_account_id: null });
      await notifyGs(opponentId, 'Giftsweeper', 'Match over! Check your rewards.');
    } else {
      await updateGsMatch(match.id, { current_turn_account_id: opponentId });
      await notifyGs(opponentId, 'Giftsweeper', `${players.me.name} took their turn. Your turn!`);
    }
    const newBalance = await getBalance(meId);
    return { results, newly_won_items: newlyWon, charged_points: cost, my_balance: newBalance, match_finished: matchFinished };
  });

  fastify.post('/api/games/giftsweeper/mark-read', async (req) => {
    const meId = getEffectiveAccountId(req);
    await query(
      `UPDATE notifications SET read_at = NOW() WHERE account_id = $1 AND type = 'gs_turn' AND read_at IS NULL`,
      [meId],
    );
    return { ok: true };
  });
}
