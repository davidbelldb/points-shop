import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../../db.js';

export async function findByUsername(username) {
  const { rows } = await query(
    `SELECT id, username, password_hash, role, name, email, photo_url, points_balance
       FROM accounts WHERE LOWER(username) = LOWER($1)`,
    [username],
  );
  return rows[0] ?? null;
}

export async function findById(id) {
  const { rows } = await query(
    `SELECT id, username, role, name, email, photo_url, points_balance
       FROM accounts WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (account_id, token) VALUES ($1, $2)`,
    [accountId, token],
  );
  return token;
}

/* Long-lived token for the home-screen / lock-screen widgets. Same sessions
   table (so the existing bearer lookup + expiry pruning just work), but with a
   far longer horizon than a normal 30-day login since the widget can't
   silently re-auth the way the app can. Revoke by deleting the row. */
export async function createWidgetSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO sessions (account_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '400 days')`,
    [accountId, token],
  );
  return token;
}

export async function findSession(token) {
  const { rows } = await query(
    `SELECT s.account_id, s.impersonating_account_id, s.token, s.expires_at,
            a.role, a.username
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token],
  );
  if (rows.length === 0) return null;
  // Throttled — only write last_used_at if it's stale by >5 minutes.
  // findSession runs on EVERY request via the onRequest hook, and since
  // /api/bootstrap fans out to 5 fastify.inject() sub-requests (each of
  // which re-runs onRequest), a single page load was firing 6 UPDATEs
  // against this table. Constant single-row UPDATEs bloat the table and
  // its indexes with dead tuples, making this exact lookup progressively
  // slower the more the site is used — without ever growing row count.
  query(
    `UPDATE sessions SET last_used_at = NOW()
      WHERE token = $1 AND last_used_at < NOW() - INTERVAL '5 minutes'`,
    [token],
  ).catch(() => {});
  return rows[0];
}

export async function deleteSession(token) {
  await query(`DELETE FROM sessions WHERE token = $1`, [token]);
}

export async function verifyPassword(account, password) {
  if (!account?.password_hash) return false;
  return bcrypt.compare(password, account.password_hash);
}

export async function ensureDefaultPasswords() {
  const { rows } = await query(
    `SELECT id, username FROM accounts
      WHERE (password_hash IS NULL OR password_hash = '') AND username IS NOT NULL`,
  );
  for (const a of rows) {
    const hash = await bcrypt.hash('password', 10);
    await query(`UPDATE accounts SET password_hash = $1 WHERE id = $2`, [hash, a.id]);
    console.log(`[auth] seeded default password for '${a.username}'`);
  }
}
