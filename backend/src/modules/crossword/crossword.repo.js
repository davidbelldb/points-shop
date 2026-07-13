import { query } from '../../db.js';
import { buildLayout } from './layout.js';

const rc = (r, c) => `${r},${c}`;

export async function getCrossword() {
  const { rows } = await query(`SELECT title, words, media, version FROM crossword WHERE id = 1`);
  return rows[0] ?? { title: 'Crossword', words: [], media: [], version: 1 };
}

/* Save the authored puzzle. Bumps the version but PRESERVES play progress so
   the puzzle can be edited mid-game (see remapAllProgress in the route, which
   shifts each player's letters to match the new grid). A full wipe is a
   separate, explicit admin action (resetAllProgress). */
export async function saveCrossword(title, words, media = []) {
  const { rows } = await query(
    `INSERT INTO crossword (id, title, words, media, version, updated_at)
     VALUES (1, $1, $2::jsonb, $3::jsonb, 2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, words = EXCLUDED.words, media = EXCLUDED.media,
           version = crossword.version + 1, updated_at = NOW()
     RETURNING title, words, media, version`,
    [title || 'Crossword', JSON.stringify(words), JSON.stringify(media)],
  );
  return rows[0];
}

/* After an edit, carry every player's letters onto the NEW grid word-by-word.
   Adding or reordering words repacks the whole layout, so a single global shift
   is wrong (it scrambled boards). Instead we match each word between the old and
   new layout by its answer + direction and copy the player's letters cell-by-cell
   along the word, so each answer follows its slot wherever it moves. Letters for
   words that were removed or whose spelling changed are dropped (their squares no
   longer exist). Reopens submitted boards so freshly-added words can still be
   filled. */
export async function remapAllProgress(oldWords, newWords) {
  const oldL = buildLayout(oldWords || []);
  const newL = buildLayout(newWords || []);

  // Pair each new-layout entry with an old-layout entry of the same answer +
  // direction. Greedy-consume so duplicate answers pair one-to-one.
  const oldByKey = new Map();
  for (const e of [...oldL.across, ...oldL.down]) {
    const kk = `${e.word}|${e.direction}`;
    if (!oldByKey.has(kk)) oldByKey.set(kk, []);
    oldByKey.get(kk).push(e);
  }
  const pairs = []; // [oldEntry, newEntry]
  for (const ne of [...newL.across, ...newL.down]) {
    const bucket = oldByKey.get(`${ne.word}|${ne.direction}`);
    const oe = bucket && bucket.length ? bucket.shift() : null;
    if (oe) pairs.push([oe, ne]);
  }
  if (!pairs.length) return; // nothing recognisable to carry over

  const validKeys = new Set(Object.keys(newL.cells));
  const { rows } = await query(`SELECT account_id, entries FROM crossword_progress`);
  for (const row of rows) {
    const src = row.entries || {};
    const next = {};
    for (const [oe, ne] of pairs) {
      const n = Math.min(oe.cells.length, ne.cells.length);
      for (let j = 0; j < n; j++) {
        const v = src[rc(oe.cells[j].r, oe.cells[j].c)];
        if (!v) continue;
        const nk = rc(ne.cells[j].r, ne.cells[j].c);
        if (validKeys.has(nk)) next[nk] = v;
      }
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
