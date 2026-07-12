import { getCrossword, saveCrossword } from './crossword.repo.js';

const DIRECTIONS = new Set(['across', 'down']);
const MAX_WORDS = 30;

// Letters only, uppercased. Returns '' if nothing usable.
const clean = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');

/* Validate the authored word list. Rules (mirrors the admin UI):
   - 1..30 words
   - each has a ≥2-letter word, a hint, and an across/down direction
   - every word after the first shares at least one letter with the pool of
     letters used by the previous words (so an intersecting grid is possible). */
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
    if (i > 0) {
      const shares = [...letters].some((ch) => pool.has(ch));
      if (!shares) return `Word ${i + 1} ("${w.word}") must share a letter with an earlier word.`;
    }
    for (const ch of letters) pool.add(ch);
  }
  return null;
}

export default async function crosswordRoutes(fastify) {
  // Admin-only (gated by the global /api/admin/* hook).
  fastify.get('/api/admin/crossword', async () => getCrossword());

  fastify.put('/api/admin/crossword', async (req, reply) => {
    const { title, words } = req.body ?? {};
    const err = validate(words);
    if (err) return reply.code(400).send({ error: err });
    // Normalise: trim hints, uppercase words to letters-only for storage.
    const clean_words = words.map((w) => ({
      word: clean(w.word),
      hint: String(w.hint).trim(),
      direction: w.direction,
    }));
    return saveCrossword(title, clean_words);
  });
}
