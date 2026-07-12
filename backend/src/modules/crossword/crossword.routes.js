import {
  getCrossword, saveCrossword, getProgress, saveProgress, markSubmitted, resetProgress, resetAllProgress,
} from './crossword.repo.js';
import { buildLayout, toPlayPayload } from './layout.js';
import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';
import { creditPoints } from '../games/games.repo.js';
import { query } from '../../db.js';

const DIRECTIONS = new Set(['across', 'down']);
const MAX_WORDS = 30;
const SOLVE_POINTS = 200;

const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');

function validate(words) {
  if (!Array.isArray(words) || words.length < 1) return 'At least one word is required.';
  if (words.length > MAX_WORDS) return `A maximum of ${MAX_WORDS} words is allowed.`;
  const pool = new Set();
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? {};
    const letters = clean(w.word);
    if (letters.length < 2) return `Word ${i + 1} needs at least two letters.`;
    if (!String(w.hint ?? '').trim()) return `Word ${i + 1} needs a hint.`;
    if (!DIRECTIONS.has(w.direction)) return `Word ${i + 1} needs a direction (across or down).`;
    if (i > 0 && ![...letters].some((ch) => pool.has(ch))) {
      return `Word ${i + 1} ("${w.word}") must share a letter with an earlier word.`;
    }
    for (const ch of letters) pool.add(ch);
  }
  return null;
}

// Keep only "r,c" -> single A-Z pairs.
function sanitizeEntries(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (/^\d+,\d+$/.test(k)) {
        const ch = clean(v).slice(0, 1);
        if (ch) out[k] = ch;
      }
    }
  }
  return out;
}

async function isOpen() {
  const { rows } = await query(`SELECT value FROM settings WHERE key = 'crossword_open'`);
  return rows[0]?.value === 'true';
}
// Admin (David) can always play; Katie only when the puzzle is opened.
async function canPlay(req) {
  return isAdmin(req) || (await isOpen());
}

export default async function crosswordRoutes(fastify) {
  /* ---- Admin builder (gated by the global /api/admin/* hook) ---- */
  fastify.get('/api/admin/crossword', async () => {
    const cw = await getCrossword();
    return { ...cw, open: await isOpen() };
  });

  // Admin: reset everyone's play so the crossword can be attempted fresh.
  fastify.post('/api/admin/crossword/reset-progress', async () => {
    await resetAllProgress();
    return { ok: true };
  });

  fastify.put('/api/admin/crossword', async (req, reply) => {
    const { title, words } = req.body ?? {};
    const err = validate(words);
    if (err) return reply.code(400).send({ error: err });
    const cleanWords = words.map((w) => ({
      word: clean(w.word), hint: String(w.hint).trim(), direction: w.direction,
    }));
    return saveCrossword(title, cleanWords);
  });

  /* ---- Play (admin always; Katie when opened) ---- */
  fastify.get('/api/crossword', async (req, reply) => {
    if (!(await canPlay(req))) return reply.code(404).send({ error: 'not found' });
    const cw = await getCrossword();
    const layout = buildLayout(cw.words ?? []);
    const accountId = getEffectiveAccountId(req);
    const prog = await getProgress(accountId);
    let result = null;
    if (prog.submitted) {
      result = {};
      for (const [k, cell] of Object.entries(layout.cells)) {
        result[k] = (prog.entries?.[k] ?? '') === cell.letter;
      }
    }
    return {
      title: cw.title,
      version: cw.version,
      ...toPlayPayload(layout),
      progress: { entries: prog.entries ?? {}, submitted: !!prog.submitted, won: !!prog.won, result, updatedAt: prog.updated_at ?? null },
    };
  });

  // "Set" — persist the current fill so the player can leave and resume.
  fastify.put('/api/crossword/progress', async (req, reply) => {
    if (!(await canPlay(req))) return reply.code(404).send({ error: 'not found' });
    const accountId = getEffectiveAccountId(req);
    await saveProgress(accountId, sanitizeEntries(req.body?.entries));
    return { ok: true };
  });

  // Reset the board after a submission so the player can try again.
  fastify.post('/api/crossword/reset', async (req, reply) => {
    if (!(await canPlay(req))) return reply.code(404).send({ error: 'not found' });
    await resetProgress(getEffectiveAccountId(req));
    return { ok: true };
  });

  // One-shot submit: locks the grid, grades every square, awards 200 on a
  // fully-correct solve (once per puzzle version).
  fastify.post('/api/crossword/submit', async (req, reply) => {
    if (!(await canPlay(req))) return reply.code(404).send({ error: 'not found' });
    const accountId = getEffectiveAccountId(req);
    const cw = await getCrossword();
    const layout = buildLayout(cw.words ?? []);
    const fillable = Object.keys(layout.cells);
    if (!fillable.length) return reply.code(400).send({ error: 'No puzzle to submit.' });

    const prog = await getProgress(accountId);
    if (prog.submitted) {
      const result = {};
      for (const k of fillable) result[k] = (prog.entries?.[k] ?? '') === layout.cells[k].letter;
      return { submitted: true, won: !!prog.won, result, pts: 0, alreadyDone: true };
    }

    const entries = sanitizeEntries(req.body?.entries);
    if (!fillable.every((k) => entries[k])) {
      return reply.code(400).send({ error: 'Fill every square before submitting.' });
    }

    const result = {};
    let allCorrect = true;
    for (const k of fillable) {
      const ok = entries[k] === layout.cells[k].letter;
      result[k] = ok;
      if (!ok) allCorrect = false;
    }
    await markSubmitted(accountId, entries, allCorrect);

    let pts = 0;
    if (allCorrect) {
      const reason = `crossword-solve-v${cw.version}`;
      const { rows } = await query(
        `SELECT 1 FROM points_ledger WHERE reason = $1 AND account_id = $2 LIMIT 1`,
        [reason, accountId],
      );
      if (!rows.length) { pts = SOLVE_POINTS; await creditPoints(accountId, SOLVE_POINTS, reason); }
    }
    return { submitted: true, won: allCorrect, result, pts };
  });
}
