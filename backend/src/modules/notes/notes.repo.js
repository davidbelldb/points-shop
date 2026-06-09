import { query } from '../../db.js';

/** Lazily purge deleted notes older than 30 days. Called before any list query. */
async function purgeExpiredDeleted() {
  await query(`
    DELETE FROM notes
    WHERE status = 'deleted'
      AND deleted_at < NOW() - INTERVAL '30 days'
  `);
}

/**
 * List notes visible to an account, filtered by status.
 * Personal notes: account_id = accountId
 * Shared notes:   type = 'shared' (visible to all authenticated users)
 */
export async function listNotes(accountId, status = 'active') {
  await purgeExpiredDeleted();
  const { rows } = await query(
    `SELECT id, body, type, status, created_at, updated_at, deleted_at
       FROM notes
      WHERE status = $2
        AND (account_id = $1 OR type = 'shared')
      ORDER BY updated_at DESC`,
    [accountId, status],
  );
  return rows;
}

export async function getNote(id, accountId) {
  const { rows } = await query(
    `SELECT id, body, type, status, created_at, updated_at
       FROM notes
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')`,
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createNote(accountId, type = 'personal') {
  const { rows } = await query(
    `INSERT INTO notes (account_id, body, type)
     VALUES ($1, '', $2)
     RETURNING id, body, type, status, created_at, updated_at`,
    [accountId, type],
  );
  return rows[0];
}

export async function updateNote(id, accountId, body) {
  const { rows } = await query(
    `UPDATE notes
        SET body = $3, updated_at = NOW()
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')
        AND status = 'active'
      RETURNING id, body, type, status, created_at, updated_at`,
    [id, accountId, body],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not editable');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function archiveNote(id, accountId) {
  const { rows } = await query(
    `UPDATE notes
        SET status = 'archived', updated_at = NOW()
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')
      RETURNING id, body, type, status, created_at, updated_at`,
    [id, accountId],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not accessible');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function softDeleteNote(id, accountId) {
  const { rows } = await query(
    `UPDATE notes
        SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')
      RETURNING id, body, type, status, created_at, updated_at, deleted_at`,
    [id, accountId],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not accessible');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function restoreNote(id, accountId) {
  const { rows } = await query(
    `UPDATE notes
        SET status = 'active', deleted_at = NULL, updated_at = NOW()
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')
      RETURNING id, body, type, status, created_at, updated_at`,
    [id, accountId],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not accessible');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

/** Change a note's type — only the original owner can do this. */
export async function changeNoteType(id, accountId, type) {
  const { rows } = await query(
    `UPDATE notes
        SET type = $3, updated_at = NOW()
      WHERE id = $1
        AND account_id = $2
        AND status = 'active'
      RETURNING id, body, type, status, created_at, updated_at`,
    [id, accountId, type],
  );
  if (!rows[0]) {
    const err = new Error('Note not found or not editable');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

export async function hardDeleteNote(id, accountId) {
  const { rowCount } = await query(
    `DELETE FROM notes
      WHERE id = $1
        AND (account_id = $2 OR type = 'shared')
        AND status = 'deleted'`,
    [id, accountId],
  );
  if (!rowCount) {
    const err = new Error('Note not found, not in trash, or not accessible');
    err.statusCode = 404;
    throw err;
  }
}
