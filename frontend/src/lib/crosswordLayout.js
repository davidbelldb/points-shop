/*
 * Crossword layout engine (shared by the admin editor preview and the play
 * page). Takes an ordered list of authored words — { word, hint, direction } —
 * and greedily places them into an intersecting grid: word 1 at the origin,
 * every later word crossing an existing letter at a matching square. Cells not
 * covered by any word are "black" (blanks). Returns the grid dimensions, a cell
 * map, standard clue numbering, and Across/Down clue lists.
 */

export const cleanWord = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');
const key = (r, c) => `${r},${c}`;

// Precise validation message for the admin UI (mirrors the backend rules).
export function connectivityError(rawWords) {
  const words = (rawWords || []).map((w) => ({
    word: cleanWord(w.word), hint: String(w.hint ?? '').trim(), direction: w.direction,
  }));
  if (words.length < 1) return 'Add at least one word.';
  if (words.length > 30) return 'Maximum of 30 words.';
  const pool = new Set();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.word.length < 2) return `Word ${i + 1} needs at least two letters.`;
    if (!w.hint) return `Word ${i + 1} needs a hint.`;
    if (w.direction !== 'across' && w.direction !== 'down') return `Word ${i + 1} needs a direction.`;
    if (i > 0 && ![...w.word].some((ch) => pool.has(ch))) {
      return `Word ${i + 1} must share a letter with an earlier word.`;
    }
    for (const ch of w.word) pool.add(ch);
  }
  return null;
}

export function buildLayout(rawWords) {
  const words = (rawWords || [])
    .map((w) => ({
      word: cleanWord(w.word),
      hint: String(w.hint ?? ''),
      direction: w.direction === 'down' ? 'down' : 'across',
    }))
    .filter((w) => w.word.length >= 1);

  const placed = [];
  const unplaced = [];
  const grid = new Map(); // "r,c" -> letter

  // Evaluate a candidate placement. A word may reuse MORE THAN ONE existing
  // letter (multiple crossings) as long as every overlapped square matches;
  // brand-new squares must not touch a parallel word. Returns the number of
  // crossings (shared letters) so callers can prefer the densest placement.
  function evaluate(word, dir, startR, startC) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    // Squares immediately before/after the word must be empty (no run-ons).
    if (grid.has(key(startR - dr, startC - dc))) return -1;
    if (grid.has(key(startR + dr * word.length, startC + dc * word.length))) return -1;
    let crossings = 0;
    for (let j = 0; j < word.length; j++) {
      const r = startR + dr * j, c = startC + dc * j;
      const existing = grid.get(key(r, c));
      if (existing !== undefined) {
        if (existing !== word[j]) return -1; // conflicting overlap
        crossings++;                          // a valid shared letter
      } else {
        // A fresh square must not sit alongside a parallel word.
        if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) return -1;
      }
    }
    return crossings >= 1 ? crossings : -1; // must connect to the grid
  }

  function commit(w, dir, startR, startC) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const cells = [];
    for (let j = 0; j < w.word.length; j++) {
      const r = startR + dr * j, c = startC + dc * j;
      grid.set(key(r, c), w.word[j]);
      cells.push({ r, c });
    }
    placed.push({ ...w, cells, startR, startC });
  }

  words.forEach((w, i) => {
    if (i === 0) { commit(w, w.direction, 0, 0); return; }
    const dir = w.direction;
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    // Try anchoring every letter of the new word onto every matching square,
    // and keep the placement that reuses the most existing letters.
    let best = null;
    const seen = new Set();
    for (const [cellKey, letter] of grid) {
      const [cr, cc] = cellKey.split(',').map(Number);
      for (let li = 0; li < w.word.length; li++) {
        if (w.word[li] !== letter) continue;
        const startR = cr - dr * li, startC = cc - dc * li;
        const sk = key(startR, startC);
        if (seen.has(sk)) continue;
        seen.add(sk);
        const crossings = evaluate(w.word, dir, startR, startC);
        if (crossings > 0 && (!best || crossings > best.crossings)) best = { startR, startC, crossings };
      }
    }
    if (best) commit(w, dir, best.startR, best.startC);
    else unplaced.push({ ...w, index: i });
  });

  if (!placed.length) return { rows: 0, cols: 0, cells: {}, across: [], down: [], placements: [], unplaced, offsetR: 0, offsetC: 0 };

  // Normalise coordinates to a 0-based bounding box.
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const p of placed) for (const { r, c } of p.cells) {
    minR = Math.min(minR, r); minC = Math.min(minC, c);
    maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
  }
  const rows = maxR - minR + 1, cols = maxC - minC + 1;
  const norm = placed.map((p) => ({
    ...p,
    startR: p.startR - minR, startC: p.startC - minC,
    cells: p.cells.map(({ r, c }) => ({ r: r - minR, c: c - minC })),
  }));

  // Number the start squares in reading order (top→bottom, left→right).
  const startKeys = [...new Set(norm.map((p) => key(p.startR, p.startC)))]
    .map((k) => k.split(',').map(Number))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numberOf = new Map();
  startKeys.forEach(([r, c], idx) => numberOf.set(key(r, c), idx + 1));

  const cells = {};
  for (const p of norm) {
    p.cells.forEach(({ r, c }, j) => {
      const k = key(r, c);
      if (!cells[k]) cells[k] = { letter: p.word[j] };
    });
  }
  for (const [k, n] of numberOf) if (cells[k]) cells[k].number = n;

  const across = [], down = [];
  norm.forEach((p) => {
    const number = numberOf.get(key(p.startR, p.startC));
    const entry = {
      id: (p.direction === 'across' ? 'A' : 'D') + number,
      number, hint: p.hint, word: p.word, len: p.word.length,
      direction: p.direction, startR: p.startR, startC: p.startC, cells: p.cells,
    };
    (p.direction === 'across' ? across : down).push(entry);
    for (const { r, c } of p.cells) {
      const cell = cells[key(r, c)];
      if (p.direction === 'across') cell.acrossId = entry.id; else cell.downId = entry.id;
    }
  });
  across.sort((a, b) => a.number - b.number);
  down.sort((a, b) => a.number - b.number);

  return { rows, cols, cells, across, down, placements: norm, unplaced, offsetR: minR, offsetC: minC };
}
