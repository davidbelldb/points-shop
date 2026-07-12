/*
 * Server-side crossword layout (mirror of frontend/src/lib/crosswordLayout.js).
 * Kept here so the backend can produce an answer-stripped puzzle payload and
 * grade submissions without ever sending the solution letters to the client.
 */

export const cleanWord = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '');
const key = (r, c) => `${r},${c}`;

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
  const grid = new Map();

  // Allow a word to reuse MORE THAN ONE existing letter (multiple crossings);
  // every overlap must match, fresh squares mustn't touch a parallel word.
  // Returns the crossing count (or -1 if invalid) so we can pick the densest fit.
  function evaluate(word, dir, startR, startC) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    if (grid.has(key(startR - dr, startC - dc))) return -1;
    if (grid.has(key(startR + dr * word.length, startC + dc * word.length))) return -1;
    let crossings = 0;
    for (let j = 0; j < word.length; j++) {
      const r = startR + dr * j, c = startC + dc * j;
      const existing = grid.get(key(r, c));
      if (existing !== undefined) {
        if (existing !== word[j]) return -1;
        crossings++;
      } else if (grid.has(key(r + dc, c + dr)) || grid.has(key(r - dc, c - dr))) {
        return -1;
      }
    }
    return crossings >= 1 ? crossings : -1;
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

  if (!placed.length) return { rows: 0, cols: 0, cells: {}, across: [], down: [], placements: [], unplaced };

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

  return { rows, cols, cells, across, down, placements: norm, unplaced };
}

/* Strip the solution letters for the client. Returns the grid geometry, clue
   numbering and clue text/lengths — everything needed to render and play,
   but not the answers. */
export function toPlayPayload(layout) {
  const cells = {};
  for (const [k, cell] of Object.entries(layout.cells)) {
    cells[k] = {};
    if (cell.number) cells[k].number = cell.number;
    if (cell.acrossId) cells[k].acrossId = cell.acrossId;
    if (cell.downId) cells[k].downId = cell.downId;
  }
  const strip = (e) => ({
    id: e.id, number: e.number, hint: e.hint, len: e.len,
    direction: e.direction, startR: e.startR, startC: e.startC, cells: e.cells,
  });
  return {
    rows: layout.rows, cols: layout.cols, cells,
    across: layout.across.map(strip), down: layout.down.map(strip),
  };
}
