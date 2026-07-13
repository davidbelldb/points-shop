import { query } from '../../db.js';

export async function getCrossword() {
  const { rows } = await query(`SELECT title, words, version FROM crossword WHERE id = 1`);
  return rows[0] ?? { title: 'Crossword', words: [], version: 1 };
}

/* Save the authored puzzle. Bumps the version but PRESERVES play progress so
   the puzzle can be edited mid-game (see remapAllProgress in the route, which
   shifts each player's letters to match the new grid). A full wipe is a
   separate, explicit admin action (resetAllProgress). */
export async function saveCrossword(title, words) {
  const { rows } = await query(
    `INSERT INTO crossword (id, title, words, version, updated_at)
     VALUES (1, $1, $2::jsonb, 2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, words = EXCLUDED.words,
           version = crossword.version + 1, updated_at = NOW()
     RETURNING title, words, version`,
    [title || 'Crossword', JSON.stringify(words)],
  );
  return rows[0];
}

/* After an edit, shift every player's placed letters by the grid's
   normalisation delta (dR, dC) so they stay on the right squares, dropping any
   that no longer land on a fillable cell. Reopens submitted boards so new words
   can still be filled. Best-effort: correct when words are appended (the shared
   prefix places identically); editing existing words may misplace letters. */
export async function remapAllProgress(dR, dC, validKeys) {
  if (dR === 0 && dC === 0) return; // grid didn't shift — nothing to move
  const { rows } = await query(`SELECT account_id, entries, submitted FROM crossword_progress`);
  for (const row of rows) {
    const src = row.entries || {};
    const next = {};
    for (const [k, v] of Object.entries(src)) {
      const [r, c] = k.split(',').map(Number);
      const nk = `${r + dR},${c + dC}`;
      if (validKeys.has(nk)) next[nk] = v;
    }
    await query(
      `UPDATE crossword_progress
          SET entries = $2::jsonb, submitted = FALSE, won = FALSE, submitted_at = NULL, updated_at = NOW()
        WHERE account_id = $1`,
      [row.account_id, JSON.stringify(next)],
    );
  }
}

export async function getProgress(accountId) {
  const { rows } = await query(
    `SELECT entries, submitted, won, updated_at FROM crossword_progress WHERE account_id = $1`,
    [accountId],
  );
  return rows[0] ?? { entries: {}, submitted: false, won: false, updated_at: null };
}

export async function saveProgress(accountId, entries) {
  await query(
    `INSERT INTO crossword_progress (account_id, entries, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET entries = EXCLUDED.entries, updated_at = NOW()
     WHERE crossword_progress.submitted = FALSE`,
    [accountId, JSON.stringify(entries)],
  );
}

// Reset a player's board so they can try again. Points already awarded stay in
// the ledger, so re-winning the same puzzle version won't pay out twice.
export async function resetProgress(accountId) {
  await query(`DELETE FROM crossword_progress WHERE account_id = $1`, [accountId]);
}

// Admin: clear every player's board so it can be attempted fresh.
export async function resetAllProgress() {
  await query(`DELETE FROM crossword_progress`);
}

export async function markSubmitted(accountId, entries, won) {
  await query(
    `INSERT INTO crossword_progress (account_id, entries, submitted, won, submitted_at, updated_at)
     VALUES ($1, $2::jsonb, TRUE, $3, NOW(), NOW())
     ON CONFLICT (account_id) DO UPDATE
       SET entries = EXCLUDED.entries, submitted = TRUE, won = EXCLUDED.won,
           submitted_at = NOW(), updated_at = NOW()`,
    [accountId, JSON.stringify(entries), won],
  );
}
