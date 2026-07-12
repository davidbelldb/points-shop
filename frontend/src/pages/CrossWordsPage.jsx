import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { buildLayout } from '../lib/crosswordLayout.js';

const key = (r, c) => `${r},${c}`;

export default function CrossWordsPage() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);      // { title, words }
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState({});  // "r,c" -> letter
  const [selected, setSelected] = useState(null); // { r, c }
  const [dir, setDir] = useState('across');
  const [checked, setChecked] = useState(false);
  const inputRefs = useRef({});

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.admin.getCrossword()
      .then(setCfg)
      .catch((e) => setError(e.message));
  }, [user]);

  const layout = useMemo(() => buildLayout(cfg?.words ?? []), [cfg]);

  // Entry (across/down) that contains the selected cell in the active direction.
  const currentEntry = useMemo(() => {
    if (!selected) return null;
    const cell = layout.cells[key(selected.r, selected.c)];
    if (!cell) return null;
    const id = dir === 'across' ? cell.acrossId : cell.downId;
    const list = dir === 'across' ? layout.across : layout.down;
    return list.find((e) => e.id === id)
      ?? layout.across.find((e) => e.id === cell.acrossId)
      ?? layout.down.find((e) => e.id === cell.downId)
      ?? null;
  }, [selected, dir, layout]);

  const highlight = useMemo(() => {
    const s = new Set();
    if (currentEntry) for (const { r, c } of currentEntry.cells) s.add(key(r, c));
    return s;
  }, [currentEntry]);

  if (user && user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-sm text-neutral-500">
        Page not found. <Link to="/" className="text-amber-700">Go home</Link>
      </div>
    );
  }

  function focusCell(r, c) {
    inputRefs.current[key(r, c)]?.focus();
    inputRefs.current[key(r, c)]?.select?.();
  }

  function selectCell(r, c) {
    const cell = layout.cells[key(r, c)];
    if (!cell) return;
    if (selected && selected.r === r && selected.c === c) {
      // Toggle direction if this cell belongs to both an across and a down word.
      if (cell.acrossId && cell.downId) setDir((d) => (d === 'across' ? 'down' : 'across'));
    } else {
      setSelected({ r, c });
      setDir(cell.acrossId ? (cell.downId && dir === 'down' ? 'down' : 'across') : 'down');
    }
  }

  function stepFrom(r, c, delta) {
    if (!currentEntry) return null;
    const idx = currentEntry.cells.findIndex((cell) => cell.r === r && cell.c === c);
    const next = currentEntry.cells[idx + delta];
    return next ?? null;
  }

  function onInput(r, c, value) {
    const ch = (value.slice(-1) || '').toUpperCase().replace(/[^A-Z]/g, '');
    setChecked(false);
    setEntries((e) => ({ ...e, [key(r, c)]: ch }));
    if (ch) {
      const nxt = stepFrom(r, c, 1);
      if (nxt) focusCell(nxt.r, nxt.c);
    }
  }

  function onKeyDown(r, c, e) {
    if (e.key === 'Backspace' && !entries[key(r, c)]) {
      e.preventDefault();
      const prev = stepFrom(r, c, -1);
      if (prev) { setEntries((en) => ({ ...en, [key(prev.r, prev.c)]: '' })); focusCell(prev.r, prev.c); }
    } else if (e.key === 'ArrowRight' && layout.cells[key(r, c + 1)]) { setDir('across'); focusCell(r, c + 1); }
    else if (e.key === 'ArrowLeft' && layout.cells[key(r, c - 1)]) { setDir('across'); focusCell(r, c - 1); }
    else if (e.key === 'ArrowDown' && layout.cells[key(r + 1, c)]) { setDir('down'); focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp' && layout.cells[key(r - 1, c)]) { setDir('down'); focusCell(r - 1, c); }
  }

  function selectEntry(entry) {
    setDir(entry.direction);
    setSelected({ r: entry.startR, c: entry.startC });
    setTimeout(() => focusCell(entry.startR, entry.startC), 0);
  }

  function reveal() {
    const next = {};
    for (const [k, cell] of Object.entries(layout.cells)) next[k] = cell.letter;
    setEntries(next); setChecked(false);
  }
  function clearAll() { setEntries({}); setChecked(false); }

  const solved = useMemo(() => {
    if (!layout.rows) return false;
    return Object.entries(layout.cells).every(([k, cell]) => entries[k] === cell.letter);
  }, [entries, layout]);

  const title = cfg?.title || 'Crossword';
  const cellSize = layout.cols ? `min(2.4rem, calc((100vw - 2.5rem) / ${layout.cols}))` : '2.4rem';

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <div className="flex items-center justify-between py-3">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <span className="text-sm font-semibold text-neutral-800">{title}</span>
        <span className="w-10" />
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cfg && !layout.rows && !error && (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
          No crossword configured yet. Build one in Admin → Cross-words.
        </p>
      )}

      {layout.rows > 0 && (
        <>
          {solved && (
            <p className="mb-3 rounded-xl bg-teal-100 px-3 py-2 text-center text-sm font-semibold text-teal-900">Solved! Nice one.</p>
          )}

          {/* Grid — same square style as Giftsweeper / Tic-Tac-Face */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${layout.cols}, ${cellSize})`, justifyContent: 'center' }}>
              {Array.from({ length: layout.rows * layout.cols }).map((_, idx) => {
                const r = Math.floor(idx / layout.cols), c = idx % layout.cols;
                const k = key(r, c);
                const cell = layout.cells[k];
                if (!cell) return <div key={k} className="rounded-[3px] bg-black" style={{ width: cellSize, height: cellSize }} />;
                const isSel = selected && selected.r === r && selected.c === c;
                const inWord = highlight.has(k);
                let cls = 'bg-neutral-100';
                if (inWord) cls = 'bg-teal-100';
                if (isSel) cls = 'bg-pink-200 ring-2 ring-pink-500 z-10';
                const val = entries[k] ?? '';
                const wrong = checked && val && val !== cell.letter;
                const right = checked && val && val === cell.letter;
                return (
                  <div key={k} className={`relative rounded-[3px] border border-neutral-200 ${cls}`} style={{ width: cellSize, height: cellSize }}>
                    {cell.number && <span className="pointer-events-none absolute left-[2px] top-[1px] text-[8px] leading-none text-neutral-500">{cell.number}</span>}
                    <input
                      ref={(el) => { inputRefs.current[k] = el; }}
                      value={val}
                      onChange={(e) => onInput(r, c, e.target.value)}
                      onKeyDown={(e) => onKeyDown(r, c, e)}
                      onFocus={() => selectCell(r, c)}
                      onClick={() => selectCell(r, c)}
                      maxLength={1}
                      autoCapitalize="characters"
                      inputMode="text"
                      className={`h-full w-full rounded-[3px] bg-transparent text-center text-[15px] font-bold uppercase focus:outline-none ${wrong ? 'text-red-600' : right ? 'text-teal-700' : 'text-neutral-800'}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-3 flex gap-2">
            <button onClick={() => setChecked(true)} className="flex-1 rounded-xl bg-teal-300 py-2 text-sm font-semibold text-teal-900 active:scale-95">Check</button>
            <button onClick={reveal} className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 active:scale-95">Reveal</button>
            <button onClick={clearAll} className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-700 active:scale-95">Clear</button>
          </div>

          {/* Clues */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[['Across', layout.across], ['Down', layout.down]].map(([label, list]) => (
              <div key={label}>
                <h3 className="mb-1 text-sm font-bold text-neutral-800">{label}</h3>
                <ul className="space-y-1">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => selectEntry(e)}
                        className={`w-full rounded-md px-2 py-1 text-left text-sm ${currentEntry?.id === e.id ? 'bg-teal-100 text-teal-900' : 'text-neutral-700 hover:bg-neutral-100'}`}
                      >
                        <span className="font-semibold">{e.number}.</span> {e.hint} <span className="text-neutral-400">({e.len})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
