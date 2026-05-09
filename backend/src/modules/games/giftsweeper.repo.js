import { query } from '../../db.js';

export async function getActiveGsMatch(aId, bId) {
  const { rows } = await query(
    `SELECT * FROM giftsweeper_matches
      WHERE finished_at IS NULL
        AND ((initiator_account_id = $1 AND opponent_account_id = $2)
          OR (initiator_account_id = $2 AND opponent_account_id = $1))
      ORDER BY created_at DESC LIMIT 1`,
    [aId, bId],
  );
  return rows[0] ?? null;
}
export async function createGsMatch(initiatorId, opponentId, gridRows, gridCols, costPerCell) {
  const { rows } = await query(
    `INSERT INTO giftsweeper_matches
       (initiator_account_id, opponent_account_id, grid_rows, grid_cols, cost_per_cell, current_turn_account_id)
     VALUES ($1, $2, $3, $4, $5, $1)
     RETURNING *`,
    [initiatorId, opponentId, gridRows, gridCols, costPerCell],
  );
  return rows[0];
}
export async function updateGsMatch(id, patch) {
  const fields = []; const values = []; let i = 1;
  for (const [k,v] of Object.entries(patch)) { fields.push(`${k} = $${i++}`); values.push(v); }
  fields.push('updated_at = NOW()'); values.push(id);
  const { rows } = await query(
    `UPDATE giftsweeper_matches SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0];
}
export async function listGsItems(matchId, ownerId) {
  const { rows } = await query(
    `SELECT i.*, p.name AS product_name, p.thumbnail_url AS product_thumbnail
       FROM giftsweeper_items i
       LEFT JOIN products p ON p.id = i.product_id
      WHERE i.match_id = $1 AND i.owner_account_id = $2
      ORDER BY i.created_at`,
    [matchId, ownerId],
  );
  return rows;
}
export async function deleteGsItemsForOwner(matchId, ownerId) {
  await query(`DELETE FROM giftsweeper_items WHERE match_id = $1 AND owner_account_id = $2`, [matchId, ownerId]);
}
export async function insertGsItem(matchId, ownerId, productId, textLabel, cells) {
  const { rows } = await query(
    `INSERT INTO giftsweeper_items (match_id, owner_account_id, product_id, text_label, cells)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [matchId, ownerId, productId, textLabel, JSON.stringify(cells)],
  );
  return rows[0];
}
