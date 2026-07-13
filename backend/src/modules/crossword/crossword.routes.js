import {
  getCrossword, saveCrossword, getProgress, saveProgress, markSubmitted, resetProgress, resetAllProgress,
  remapAllProgress,
} from './crossword.repo.js';
import { buildLayout, toPlayPayload } from './layout.js';
import { getEffectiveAccountId, isAdmin } from '../auth/auth.helpers.js';
import { creditPoints } from '../games/games.repo.js';
import { query } from '../../db.js';

const DIRECTIONS = new Set(['across', 'down']);
const MAX_WORDS = 30;
const MAX_COLS = 18; // hard cap on grid width (kept in sync with the admin UI)
const SOLVE_POINTS = 200;

const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');

function validate(words) {
  if (!Array.isArray(words) || words.length < 1) return 'At least one word is required.';
  if (words.length > MAX_WORDS) return `A maximum of ${MAX_WORDS} words is allowed.`;
  const pool = new Set();
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? {};
    const letters = clean(w.word);
    // A word the author manually pinned (integer row+col) may stand alone; only
    // AUTO-placed words must cross an earlier word so the engine can position them.
    const pinned = Number.isInteger(w.row) && Number.isInteger(w.col);
    if (letters.length < 2) return `Word ${i + 1} needs at least two letters.`;
    if (!String(w.hint ?? '').trim()) return `Word ${i + 1} needs a hint.`;
    if (!DIRECTIONS.has(w.direction)) return `Word ${i + 1} needs a direction (across or down).`;
    if (i > 0 && !pinned && ![...letters].some((ch) => pool.has(ch))) {
      return `Word ${i + 1} ("${w.word}") must share a letter with an earlier word or be placed manually.`;
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

// Keep media items well-formed. Both types reveal as a mosaic as linked words
// are solved: voice = 2x2 (up to 4 words), photo = 2x3 (up to 6 words). Word
// links must be valid indexes.
function sanitizeMedia(media, wordCount) {
  if (!Array.isArray(media)) return [];
  return media.slice(0, 20).map((m) => {
    const type = m?.type === 'photo' ? 'photo' : 'voice';
    const words = Array.isArray(m?.words)
      ? [...new Set(m.words.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < wordCount))].slice(0, type === 'photo' ? 6 : 4)
      : [];
    return {
      id: String(m?.id || Math.random().toString(36).slice(2)),
      type,
      url: typeof m?.url === 'string' ? m.url : '',
      // Stored RELATIVE to word 1's cell (can be negative) so tiles survive
      // grid shifts when words are added. Converted to absolute on the way out.
      row: Math.round(Number(m?.row) || 0),
      col: Math.round(Number(m?.col) || 0),
      words,
    };
  }).filter((m) => m.url);
}

// Word 1's cell in the current layout — the anchor media positions are stored
// relative to, so tiles stay put when the grid shifts.
function anchorOf(layout) {
  const p = layout.placements?.[0];
  return p ? { r: p.startR, c: p.startC } : { r: 0, c: 0 };
}

// Union of every word index that has any media attached (gets live validation).
function mediaWordSet(media) {
  const s = new Set();
  for (const m of media || []) for (const wi of m.words || []) s.add(wi);
  return s;
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
    const cleanWords = words.map((w) => {
      const out = { word: clean(w.word), hint: String(w.hint).trim(), direction: w.direction };
      // Preserve an optional manual position (0..99). Anything else = auto-placed.
      if (Number.isInteger(w.row) && Number.isInteger(w.col)
          && w.row >= 0 && w.col >= 0 && w.row < 100 && w.col < 100) {
        out.row = w.row; out.col = w.col;
      }
      return out;
    });
    const cleanMedia = sanitizeMedia(req.body?.media, cleanWords.length);
    // Hard cap on grid width — beyond this the squares are too small to tap.
    const previewLayout = buildLayout(cleanWords);
    if (previewLayout.cols > MAX_COLS) {
      return reply.code(400).send({ error: `Grid is ${previewLayout.cols} columns wide — the maximum is ${MAX_COLS}. Place words more compactly or use more down words.` });
    }
    // Preserve in-flight play across the edit: carry each player's letters onto
    // the new grid word-by-word (see remapAllProgress) so answers follow their
    // slots wherever the repacked layout moves them.
    const oldWords = (await getCrossword()).words ?? [];
    const saved = await saveCrossword(title, cleanWords, cleanMedia);
    await remapAllProgress(oldWords, cleanWords);
    return saved;
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
    const payload = toPlayPayload(layout);
    // Flag entries that carry media (they live-validate as a bonus) and expose
    // the media tiles (positions/footprint), without any answers.
    const mediaWords = mediaWordSet(cw.media);
    for (const e of [...payload.across, ...payload.down]) e.hasMedia = mediaWords.has(e.wordIndex);
    const anchor = anchorOf(layout); // relative → absolute for rendering
    const media = (cw.media ?? []).map((m) => ({
      id: m.id, type: m.type, url: m.url,
      row: (m.row ?? 0) + anchor.r, col: (m.col ?? 0) + anchor.c,
      w: 2, h: m.type === 'photo' ? 3 : 2, words: m.words ?? [],
    }));
    return {
      title: cw.title,
      version: cw.version,
      ...payload,
      media,
      progress: { entries: prog.entries ?? {}, submitted: !!prog.submitted, won: !!prog.won, result, updatedAt: prog.updated_at ?? null },
    };
  });

  // Live word-check (media words only). Returns whether the player's letters for
  // that word are complete + correct, without ever sending the answer.
  fastify.post('/api/crossword/check-word', async (req, reply) => {
    if (!(await canPlay(req))) return reply.code(404).send({ error: 'not found' });
    const cw = await getCrossword();
    const wordIndex = Number(req.body?.wordIndex);
    if (!mediaWordSet(cw.media).has(wordIndex)) return reply.code(400).send({ error: 'not a media word' });
    const answer = clean(cw.words?.[wordIndex]?.word);
    const letters = clean(req.body?.letters);
    return { wordIndex, complete: letters.length === answer.length, correct: letters.length > 0 && letters === answer };
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
    // Only a fully-correct solve locks the board + awards. A miss keeps the
    // board open (entries saved) so she can fix it and submit again.
    let pts = 0;
    if (allCorrect) {
      await markSubmitted(accountId, entries, true);
      const reason = `crossword-solve-v${cw.version}`;
      const { rows } = await query(
        `SELECT 1 FROM points_ledger WHERE reason = $1 AND account_id = $2 LIMIT 1`,
        [reason, accountId],
      );
      if (!rows.length) { pts = SOLVE_POINTS; await creditPoints(accountId, SOLVE_POINTS, reason); }
    } else {
      await saveProgress(accountId, entries);
    }
    return { submitted: allCorrect, won: allCorrect, result, pts };
  });
}
