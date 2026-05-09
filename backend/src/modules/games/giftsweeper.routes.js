import { query } from '../../db.js';
import { getEffectiveAccountId } from '../auth/auth.helpers.js';
import { getPlayersFor } from './games.repo.js';
import {
  getActiveGsMatch, createGsMatch, updateGsMatch,
  listGsItems, deleteGsItemsForOwner, insertGsItem,
} from './giftsweeper.repo.js';

const DEFAULT_ROWS = 6;
const DEFAULT_COLS = 6;
const DEFAULT_COST = 1;
const MIN_ITEMS = 3;

function isValidPlacement(cells, rows, cols) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  for (const c of cells) {
    if (!Number.isInteger(c.r) || !Number.isInteger(c.c)) return false;
    if (c.r < 0 || c.r >= rows || c.c < 0 || c.c >= cols) return false;
  }
  if (cells.length === 1) return true;
  const allSameRow = cells.every((c) => c.r === cells[0].r);
  const allSameCol = cells.every((c) => c.c === cells[0].c);
  if (!allSameRow && !allSameCol) return false;
  const sorted = cells.slice().sort((a, b) => allSameRow ? a.c - b.c : a.r - b.r);
  for (let i = 1; i < sorted.length; i++) {
    const diff = allSameRow ? sorted[i].c - sorted[i-1].c : sorted[i].r - sorted[i-1].r;
    if (diff !== 1) return false;
  }
  return true;
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
function shapeMatch(match, meId) {
  if (!match) return null;
  const isInitiator = match.initiator_account_id === meId;
  return {
    id: match.id,
    grid_rows: match.grid_rows,
    grid_cols: match.grid_cols,
    cost_per_cell: match.cost_per_cell,
    you_are: isInitiator ? 'initiator' : 'opponent',
    my_setup_done:    isInitiator ? match.initiator_setup_done : match.opponent_setup_done,
    other_setup_done: isInitiator ? match.opponent_setup_done : match.initiator_setup_done,
    started: match.initiator_setup_done && match.opponent_setup_done,
    current_turn_is_me: match.current_turn_account_id === meId,
    finished: !!match.finished_at,
  };
}

export default async function giftsweeperRoutes(fastify) {
  fastify.get('/api/games/giftsweeper/state', async (req) => {
    const meId = getEffectiveAccountId(req);
    const players = await getPlayersFor(meId);
    if (!players.other) return { players, match: null, my_items: [] };
    const match = await getActiveGsMatch(meId, players.other.id);
    const myItems = match ? await listGsItems(match.id, meId) : [];
    return { players, match: shapeMatch(match, meId), my_items: myItems };
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

  fastify.post('/api/games/giftsweeper/items', async (req, reply) => {
    const meId = getEffectiveAccountId(req);
    const { items } = req.body ?? {};
    if (!Array.isArray(items)) return reply.code(400).send({ error: 'items array required' });
    const players = await getPlayersFor(meId);
    if (!players.other) return reply.code(400).send({ error: 'No opponent available' });
    const match = await getActiveGsMatch(meId, players.other.id);
    if (!match) return reply.code(404).send({ error: 'No active match' });
    const isInitiator = match.initiator_account_id === meId;
    if (isInitiator ? match.initiator_setup_done : match.opponent_setup_done) {
      return reply.code(400).send({ error: 'Setup already confirmed' });
    }
    if (items.length < MIN_ITEMS) {
      return reply.code(400).send({ error: `At least ${MIN_ITEMS} items required` });
    }
    const seenCells = [];
    for (const [idx, item] of items.entries()) {
      if (!isValidPlacement(item.cells, match.grid_rows, match.grid_cols)) {
        return reply.code(400).send({ error: `Item ${idx + 1}: invalid placement (single cell or contiguous line)` });
      }
      for (const prev of seenCells) {
        if (cellsOverlap(prev, item.cells)) {
          return reply.code(400).send({ error: `Item ${idx + 1} overlaps with another item` });
        }
      }
      seenCells.push(item.cells);
      if (isInitiator && !item.product_id) {
        return reply.code(400).send({ error: `Item ${idx + 1}: pick a product` });
      }
      if (!isInitiator && !item.text_label?.trim()) {
        return reply.code(400).send({ error: `Item ${idx + 1}: enter a forfeit description` });
      }
    }
    await deleteGsItemsForOwner(match.id, meId);
    for (const item of items) {
      await insertGsItem(
        match.id, meId,
        isInitiator ? item.product_id : null,
        isInitiator ? null : item.text_label.trim(),
        item.cells,
      );
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
    const patch = isInitiator ? { initiator_setup_done: true } : { opponent_setup_done: true };
    const updated = await updateGsMatch(match.id, patch);
    if (updated.initiator_setup_done && updated.opponent_setup_done) {
      await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} confirmed their grid. Match is on!`);
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
    await updateGsMatch(match.id, { finished_at: new Date() });
    await notifyGs(players.other.id, 'Giftsweeper', `${players.me.name} cancelled the match.`);
    return { ok: true };
  });

  fastify.post('/api/games/giftsweeper/mark-read', async (req) => {
    const meId = getEffectiveAccountId(req);
    await query(
      `UPDATE notifications SET read_at = NOW()
        WHERE account_id = $1 AND type = 'gs_turn' AND read_at IS NULL`,
      [meId],
    );
    return { ok: true };
  });
}
