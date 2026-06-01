import { query } from '../../db.js';

export async function getGsLeaderboard() {
  const { rows } = await query(
    `WITH hits AS (
       SELECT match_id, guesser_account_id, COUNT(*)::int AS items_found
       FROM giftsweeper_guesses
       WHERE hit_item_id IS NOT NULL
       GROUP BY match_id, guesser_account_id
     ),
     match_results AS (
       SELECT
         m.id                            AS match_id,
         m.initiator_account_id          AS p1_id,
         m.opponent_account_id           AS p2_id,
         COALESCE(h1.items_found, 0)     AS p1_found,
         COALESCE(h2.items_found, 0)     AS p2_found,
         CASE
           WHEN COALESCE(h1.items_found,0) > COALESCE(h2.items_found,0) THEN m.initiator_account_id
           WHEN COALESCE(h2.items_found,0) > COALESCE(h1.items_found,0) THEN m.opponent_account_id
           ELSE NULL
         END AS winner_id
       FROM giftsweeper_matches m
       LEFT JOIN hits h1 ON h1.match_id = m.id AND h1.guesser_account_id = m.initiator_account_id
       LEFT JOIN hits h2 ON h2.match_id = m.id AND h2.guesser_account_id = m.opponent_account_id
       WHERE m.finished_at IS NOT NULL
     )
     SELECT
       a.id,
       a.name,
       a.photo_url,
       COUNT(CASE WHEN mr.winner_id = a.id THEN 1 END)::int  AS wins,
       COALESCE(SUM(CASE
         WHEN a.id = mr.p1_id THEN mr.p1_found
         WHEN a.id = mr.p2_id THEN mr.p2_found
         ELSE 0
       END), 0)::int                                          AS items_found
     FROM accounts a
     JOIN match_results mr ON (mr.p1_id = a.id OR mr.p2_id = a.id)
     GROUP BY a.id, a.name, a.photo_url
     ORDER BY wins DESC, items_found DESC`,
  );
  return rows;
}

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
export async function getGsItemById(id) {
  const { rows } = await query(`SELECT * FROM giftsweeper_items WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
export async function deleteGsItemById(id, ownerId) {
  await query(`DELETE FROM giftsweeper_items WHERE id = $1 AND owner_account_id = $2`, [id, ownerId]);
}
export async function insertGsItem(matchId, ownerId, productId, textLabel, cells) {
  const { rows } = await query(
    `INSERT INTO giftsweeper_items (match_id, owner_account_id, product_id, text_label, cells)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [matchId, ownerId, productId, textLabel, JSON.stringify(cells)],
  );
  return rows[0];
}
