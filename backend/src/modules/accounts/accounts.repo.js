import { query } from '../../db.js';

const SINGLE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
const SELF_EDITABLE = ['name', 'email', 'photo_url'];

export function getDefaultAccountId() {
  return SINGLE_ACCOUNT_ID;
}

export async function getAccount() {
  const { rows } = await query(
    `SELECT id, name, email, photo_url, points_balance, created_at, updated_at
       FROM accounts WHERE id = $1`,
    [SINGLE_ACCOUNT_ID],
  );
  return rows[0] ?? null;
}

export async function getLedger(limit = 20) {
  const { rows } = await query(
    `SELECT id, delta, reason, created_at
       FROM points_ledger WHERE account_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [SINGLE_ACCOUNT_ID, limit],
  );
  return rows;
}

export async function getLedgerAdjustments(limit = 20) {
  const { rows } = await query(
    `SELECT id, delta, reason, created_at
       FROM points_ledger
      WHERE account_id = $1
        AND reason NOT LIKE 'order:%'
      ORDER BY created_at DESC LIMIT $2`,
    [SINGLE_ACCOUNT_ID, limit],
  );
  return rows;
}

export async function updateAccountSelf(patch) {
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of SELF_EDITABLE) {
    if (k in patch) {
      fields.push(`${k} = $${i++}`);
      values.push(patch[k]);
    }
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = NOW()`);
  values.push(SINGLE_ACCOUNT_ID);
  await query(`UPDATE accounts SET ${fields.join(', ')} WHERE id = $${i}`, values);
}
