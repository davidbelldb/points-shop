import { query } from '../../db.js';

export async function getPlayersFor(accountId) {
  const { rows } = await query(
    `SELECT id, username, name, photo_url, role
       FROM accounts
      ORDER BY
        CASE WHEN id = $1 THEN 0 ELSE 1 END,
        CASE role WHEN 'admin' THEN 1 ELSE 0 END,
        created_at`,
    [accountId],
  );
  const me    = rows.find((r) => r.id === accountId) ?? rows[0] ?? null;
  const other = rows.find((r) => r.id !== me?.id) ?? null;
  return { me, other };
}

export async function getActiveTtfGame(aId, bId) {
  const { rows } = await query(
    `SELECT * FROM tic_tac_face_games
      WHERE finished_at IS NULL
        AND ((p1_account_id = $1 AND p2_account_id = $2)
          OR (p1_account_id = $2 AND p2_account_id = $1))
      ORDER BY created_at DESC LIMIT 1`,
    [aId, bId],
  );
  return rows[0] ?? null;
}

export async function createTtfGame(p1Id, p2Id) {
  const { rows } = await query(
    `INSERT INTO tic_tac_face_games (p1_account_id, p2_account_id, turn_account_id)
     VALUES ($1, $2, $1) RETURNING *`,
    [p1Id, p2Id],
  );
  return rows[0];
}

export async function getTtfGameById(id) {
  const { rows } = await query(`SELECT * FROM tic_tac_face_games WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function updateTtfGame(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  fields.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await query(
    `UPDATE tic_tac_face_games SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0];
}

export async function getTtfScores(meId, otherId) {
  const { rows } = await query(
    `SELECT
       SUM(CASE WHEN winner_account_id = $1 THEN 1 ELSE 0 END)::int AS me_wins,
       SUM(CASE WHEN winner_account_id = $2 THEN 1 ELSE 0 END)::int AS other_wins,
       SUM(CASE WHEN is_draw THEN 1 ELSE 0 END)::int AS draws
     FROM tic_tac_face_games
     WHERE finished_at IS NOT NULL
       AND ((p1_account_id = $1 AND p2_account_id = $2)
         OR (p1_account_id = $2 AND p2_account_id = $1))`,
    [meId, otherId],
  );
  return rows[0] ?? { me_wins: 0, other_wins: 0, draws: 0 };
}
