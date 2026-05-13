import { query } from '../../db.js';

export async function countGamesToday(accountId) {
  const r = await query(
    `SELECT COUNT(*)::int AS c FROM shut_the_box_games
      WHERE account_id = $1 AND started_at > NOW() - INTERVAL '24 hours'`,
    [accountId],
  );
  return r.rows[0]?.c ?? 0;
}
export async function startGame(accountId) {
  const r = await query(
    `INSERT INTO shut_the_box_games (account_id) VALUES ($1) RETURNING *`,
    [accountId],
  );
  return r.rows[0];
}
export async function endGame(id, result, finalTilesOpen) {
  const r = await query(
    `UPDATE shut_the_box_games SET ended_at = NOW(), result = $1, final_tiles_open = $2 WHERE id = $3 RETURNING *`,
    [result, finalTilesOpen, id],
  );
  return r.rows[0];
}
export async function getGame(id) {
  const r = await query(`SELECT * FROM shut_the_box_games WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}
export async function insertTrophy(accountId, gameId) {
  const r = await query(
    `INSERT INTO dice_trophies (account_id, game_id) VALUES ($1, $2) RETURNING *`,
    [accountId, gameId],
  );
  return r.rows[0];
}
export async function listTrophies(accountId) {
  const r = await query(
    `SELECT * FROM dice_trophies WHERE account_id = $1 ORDER BY created_at DESC`,
    [accountId],
  );
  return r.rows;
}
