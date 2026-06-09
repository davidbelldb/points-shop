import { query } from '../../db.js';

export async function listNotes(accountId) {
  const { rows } = await query(
    `SELECT id, body, created_at, updated_at
       FROM notes
      WHERE account_id = $1
      ORDER BY updated_at DESC`,
    [accountId],
  );
  return rows;
}

export async function getNote(id, accountId) {
  const { rows } = await query(
    `SELECT id, body, created_at, updated_at
       FROM notes
      WHERE id = $1 AND account_id = $2`,
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createNote(accountId) {
  const { rows } = await query(
    `INSERT INTO notes (account_id, body)
     VALUES ($1, '')
     RETURNING id, body, created_at, updated_at`,
    [accountId],
  );
  return rows[0];
}

export async function updateNote(id, accountId, body) {
  const { rows } = await query(
    `UPDATE notes
        SET body = $3, updated_at = NOW()
      WHERE id = $1 AND account_id = $2
      RETURNING id, body, created_at, updated_at`,
    [id, accountId, body],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not yours');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function deleteNote(id, accountId) {
  const { rowCount } = await query(
    `DELETE FROM notes WHERE id = $1 AND account_id = $2`,
    [id, accountId],
  );
  if (!rowCount) {
    const err = new Error('Note not found or not yours');
    err.statusCode = 404;
    throw err;
  }
}
