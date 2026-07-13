import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import { useSettings } from '../lib/SettingsContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { useKeyboardHeight } from '../lib/useKeyboardHeight.js';
import { hapticSuccess, hapticTap, hapticParty, hapticFireworks } from '../lib/haptics.js';

const key = (r, c) => `${r},${c}`;
const CORRECT = '#61dbbc';
const WRONG = '#a04d89';
const PINK = '#ee70bd';

// One-shot celebratory burst on a win — reuses the splash-pop animation.
function WinBurst() {
  const particles = useMemo(() => Array.from({ length: 16 }, () => ({
    left: 6 + Math.random() * 88, top: 8 + Math.random() * 70,
    s0: 0.04 + Math.random() * 0.05, s1: 0.14 + Math.random() * 0.30,
    r0: Math.random() * 40 - 20, r1: Math.random() * 80 - 40,
    delay: Math.random() * 0.7, dur: 0.45 + Math.random() * 0.4,
  })), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[300] overflow-hidden">
      {particles.map((p, i) => (
        <img key={i} src="/splash.png" alt="" aria-hidden="true" style={{
          position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, width: '60vw',
          transform: 'translate(-50%, -50%)', willChange: 'transform, opacity',
          '--s0': p.s0, '--s1': p.s1, '--r0': `${p.r0}deg`, '--r1': `${p.r1}deg`,
          animation: `splash-pop ${p.dur}s ease-out ${p.delay}s both`,
        }} />
      ))}
    </div>
  );
}
const fmtTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch { return ''; }
};

// Tiny intersecting crossword shown in the result modal — teal letters.
// Win: YOU / WON crossing at O. Loss: YOU / SUCK crossing at U.
function MiniCrossword({ won, isDark }) {
  const cellBg = isDark ? '#262626' : '#f2f2f0';
  const S = 26;
  const layout = won
    ? { rows: 3, cols: 3, cells: { '0,1': 'W', '1,0': 'Y', '1,1': 'O', '1,2': 'U', '2,1': 'N' } }
    : { rows: 4, cols: 3, cells: { '0,2': 'S', '1,0': 'Y', '1,1': 'O', '1,2': 'U', '2,2': 'C', '3,2': 'K' } };
  const squares = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const ch = layout.cells[`${r},${c}`];
      squares.push(
        <div key={`${r},${c}`} style={{
          width: S, height: S, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ch ? cellBg : 'transparent', borderRadius: 4,
          color: CORRECT, fontWeight: 800, fontSize: 15,
        }}>{ch || ''}</div>,
      );
    }
  }
  return (
    <div style={{ display: 'grid', gap: 3, gridTemplateColumns: `repeat(${layout.cols}, ${S}px)`, justifyContent: 'center' }}>
      {squares}
    </div>
  );
}

export default function CrossWordsPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { refresh: refreshBasket } = useBasket();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const kbHeight = useKeyboardHeight();

  const [puzzle, setPuzzle] = useState(null); // { title, rows, cols, cells, across, down }
  const [error, setError] = useState(null);
  const [entries, setEntries] = useState({});
  const [selected, setSelected] = useState(null);
  const [dir, setDir] = useState('across');
  const [submitted, setSubmitted] = useState(false);
  const [won, setWon] = useState(false);
  const [result, setResult] = useState(null); // { "r,c": bool }
  const [pts, setPts] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [solvedWords, setSolvedWords] = useState(() => new Set()); // wordIndexes confirmed via live-check
  const [lockedCells, setLockedCells] = useState(() => new Set());  // "r,c" confirmed correct (locked teal)
  const inputRefs = useRef({});
  const saveTimer = useRef(null);

  const canSee = user?.role === 'admin' || settings.crossword_open === 'true';

  useEffect(() => {
    if (!canSee) return;
    api.getCrosswordPlay()
      .then((p) => {
        setPuzzle(p);
        const prog = p.progress ?? {};
        setEntries(prog.entries ?? {});
        setSubmitted(!!prog.submitted);
        setWon(!!prog.won);
        setResult(prog.result ?? null);
        if (prog.updatedAt) setLastSavedAt(prog.updatedAt);
      })
      .catch((e) => setError(e.message));
  }, [canSee]);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // On load, restore live-check locks for any media word already filled in.
  useEffect(() => {
    if (!puzzle) return;
    const e = puzzle.progress?.entries ?? {};
    for (const entry of [...(puzzle.across ?? []), ...(puzzle.down ?? [])]) {
      if (entry.hasMedia && entry.cells.every((c) => e[key(c.r, c.c)])) liveCheck(entry, e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  const across = puzzle?.across ?? [];
  const down = puzzle?.down ?? [];
  const cells = puzzle?.cells ?? {};
  const media = puzzle?.media ?? [];
  const mediaEntries = useMemo(() => [...across, ...down].filter((e) => e.hasMedia), [across, down]);

  // Live-check a media word: if the player's letters are complete + correct,
  // lock its cells teal and mark it solved (drives photo-mosaic reveal).
  async function liveCheck(entry, e) {
    if (entry.wordIndex == null) return;
    const letters = entry.cells.map((cell) => e[key(cell.r, cell.c)] || '').join('');
    if (letters.length < entry.len) return;
    try {
      const res = await api.checkCrosswordWord(entry.wordIndex, letters);
      if (res?.correct) {
        setSolvedWords((s) => new Set(s).add(entry.wordIndex));
        setLockedCells((s) => { const n = new Set(s); for (const c of entry.cells) n.add(key(c.r, c.c)); return n; });
      }
    } catch { /* ignore */ }
  }

  const currentEntry = useMemo(() => {
    if (!selected) return null;
    const cell = cells[key(selected.r, selected.c)];
    if (!cell) return null;
    const id = dir === 'across' ? cell.acrossId : cell.downId;
    return (dir === 'across' ? across : down).find((e) => e.id === id)
      ?? across.find((e) => e.id === cell.acrossId)
      ?? down.find((e) => e.id === cell.downId)
      ?? null;
  }, [selected, dir, across, down, cells]);

  const highlight = useMemo(() => {
    const s = new Set();
    if (currentEntry) for (const { r, c } of currentEntry.cells) s.add(key(r, c));
    return s;
  }, [currentEntry]);

  const fillable = useMemo(() => Object.keys(cells), [cells]);
  const allFilled = fillable.length > 0 && fillable.every((k) => entries[k]);

  if (user && !canSee) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-sm text-neutral-500">
        Page not found. <Link to="/" className="text-amber-700">Go home</Link>
      </div>
    );
  }

  function focusCell(r, c) {
    inputRefs.current[key(r, c)]?.focus();
    inputRefs.current[key(r, c)]?.select?.();
    revealCell(r, c);
  }

  // Lift the focused square above the on-screen keyboard once it has animated in.
  function revealCell(r, c) {
    setTimeout(() => {
      inputRefs.current[key(r, c)]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 240);
  }

  function selectCell(r, c) {
    const cell = cells[key(r, c)];
    if (!cell) return;
    if (selected && selected.r === r && selected.c === c) {
      if (cell.acrossId && cell.downId) setDir((d) => (d === 'across' ? 'down' : 'across'));
    } else {
      setSelected({ r, c });
      setDir(cell.acrossId ? (cell.downId && dir === 'down' ? 'down' : 'across') : 'down');
    }
  }

  function stepFrom(r, c, delta) {
    if (!currentEntry) return null;
    const idx = currentEntry.cells.findIndex((cell) => cell.r === r && cell.c === c);
    return currentEntry.cells[idx + delta] ?? null;
  }

  async function saveProgress(next) {
    clearTimeout(saveTimer.current);
    try { await api.saveCrosswordProgress(next); setLastSavedAt(Date.now()); }
    catch { /* best effort */ }
  }
  // Autosave shortly after any change, so every word set is persisted.
  function scheduleSave(next) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProgress(next), 700);
  }

  const isEntryFilled = (entry, e) => entry.cells.every((cell) => e[key(cell.r, cell.c)]);

  // The next clue (across then down) that still has an empty square.
  function nextUnsolvedEntry(e, current) {
    const order = [...across, ...down];
    const start = current ? order.findIndex((x) => x.id === current.id) : -1;
    for (let i = 1; i <= order.length; i++) {
      const entry = order[(start + i + order.length) % order.length];
      if (entry && !isEntryFilled(entry, e)) return entry;
    }
    return null;
  }

  function onInput(r, c, value) {
    if (submitted || lockedCells.has(key(r, c))) return;
    const ch = (value.slice(-1) || '').toUpperCase().replace(/[^A-Z]/g, '');
    const next = { ...entries, [key(r, c)]: ch };
    setEntries(next);
    scheduleSave(next);
    // Any media word that just got fully filled → live-validate it.
    if (ch) for (const e of mediaEntries) {
      if (!solvedWords.has(e.wordIndex) && e.cells.every((cell) => next[key(cell.r, cell.c)])) liveCheck(e, next);
    }
    if (!ch) return;
    // Word complete → satisfying tap + jump to the next unsolved clue.
    if (currentEntry && isEntryFilled(currentEntry, next)) {
      hapticSuccess();
      const nxtEntry = nextUnsolvedEntry(next, currentEntry);
      if (nxtEntry) selectEntry(nxtEntry, next);
    } else {
      const nxt = stepFrom(r, c, 1);
      if (nxt) focusCell(nxt.r, nxt.c);
    }
  }

  function onKeyDown(r, c, e) {
    if (submitted) return;
    if (e.key === 'Enter') { e.preventDefault(); saveProgress(entries); return; }
    if (e.key === 'Backspace' && !entries[key(r, c)]) {
      e.preventDefault();
      const prev = stepFrom(r, c, -1);
      if (prev) { const next = { ...entries, [key(prev.r, prev.c)]: '' }; setEntries(next); scheduleSave(next); focusCell(prev.r, prev.c); }
    } else if (e.key === 'ArrowRight' && cells[key(r, c + 1)]) { setDir('across'); focusCell(r, c + 1); }
    else if (e.key === 'ArrowLeft' && cells[key(r, c - 1)]) { setDir('across'); focusCell(r, c - 1); }
    else if (e.key === 'ArrowDown' && cells[key(r + 1, c)]) { setDir('down'); focusCell(r + 1, c); }
    else if (e.key === 'ArrowUp' && cells[key(r - 1, c)]) { setDir('down'); focusCell(r - 1, c); }
  }

  function selectEntry(entry, e = entries) {
    setDir(entry.direction);
    const target = entry.cells.find((cell) => !e[key(cell.r, cell.c)]) ?? entry.cells[0];
    setSelected({ r: target.r, c: target.c });
    setTimeout(() => focusCell(target.r, target.c), 0);
  }

  async function doSubmit() {
    if (!allFilled || submitted) return;
    hapticTap();
    try {
      const res = await api.submitCrossword(entries);
      setSubmitted(true); setWon(!!res.won); setResult(res.result ?? null); setPts(res.pts ?? 0);
      setResultModalOpen(true);
      if (res.won) {
        hapticParty(); hapticFireworks();
        setShowBurst(true); setTimeout(() => setShowBurst(false), 1600);
        refreshBasket?.();
      }
    } catch (e) { setError(e.message); }
  }

  function doClear() {
    setEntries({}); setConfirmClear(false); saveProgress({});
  }

  const title = puzzle?.title || 'Crossword';
  const cellSize = puzzle?.cols ? `min(2.4rem, calc((100vw - 2.5rem) / ${puzzle.cols}))` : '2.4rem';

  return (
    <div
      className="mx-auto max-w-2xl pb-24"
      style={kbHeight ? { paddingBottom: kbHeight + 32, scrollPaddingBottom: kbHeight + 32 } : undefined}
    >
      {showBurst && <WinBurst />}
      <div className="flex items-center justify-between py-3">
        <Link to="/" className="w-28 text-sm font-medium text-neutral-500">Back</Link>
        <span className="text-sm font-semibold text-neutral-800">{title}</span>
        <span className="w-28 text-right text-[11px] font-medium text-neutral-400">
          {lastSavedAt ? `Last saved ${fmtTime(lastSavedAt)}` : ''}
        </span>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {puzzle && !puzzle.rows && !error && (
        <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
          No crossword configured yet.
        </p>
      )}

      {puzzle?.rows > 0 && (
        <>
          {/* Active-clue banner — pinned under the header so she never has to
              scroll to the clue list. Tap to flip across/down. */}
          <div
            onClick={() => currentEntry && setDir((d) => (d === 'across' ? 'down' : 'across'))}
            className="sticky z-20 mb-2 rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ top: 'var(--app-header-h)', backgroundColor: PINK }}
          >
            {currentEntry
              ? `${currentEntry.number} ${currentEntry.direction === 'across' ? 'Across' : 'Down'} · ${currentEntry.hint} (${currentEntry.len})`
              : 'Tap a square or a clue to begin'}
          </div>

          <div className="flex justify-center">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${puzzle.cols}, ${cellSize})`, gridAutoRows: cellSize }}>
              {media.map((m) => (
                <div
                  key={`media-${m.id}`}
                  style={{ gridColumn: `${m.col + 1} / span ${m.w}`, gridRow: `${m.row + 1} / span ${m.h}`, zIndex: 20 }}
                  className="relative overflow-hidden rounded-md p-[3px]"
                >
                  {m.type === 'photo' ? (
                    <div className="relative h-full w-full overflow-hidden rounded-md">
                      <img src={m.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
                        {Array.from({ length: 6 }).map((_, si) => {
                          const wi = m.words[si];
                          const shown = wi != null && solvedWords.has(wi);
                          return <div key={si} style={{ backgroundColor: shown ? 'transparent' : (isDark ? '#0c0c0c' : '#111'), transition: 'background-color .4s' }} />;
                        })}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { try { new Audio(m.url).play().catch(() => {}); } catch { /* ignore */ } }}
                      className="flex h-full w-full items-center justify-center rounded-full active:scale-95"
                      style={{ backgroundColor: PINK }}
                      aria-label="Play voice note"
                    >
                      <svg viewBox="0 0 24 24" fill="white" width="52%" height="52%"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                  )}
                </div>
              ))}
              {Array.from({ length: puzzle.rows * puzzle.cols }).map((_, idx) => {
                const r = Math.floor(idx / puzzle.cols), c = idx % puzzle.cols;
                const k = key(r, c);
                const cell = cells[k];
                if (!cell) return <div key={k} className="rounded-[3px] bg-black" style={{ width: cellSize, height: cellSize }} />;
                const isSel = selected && selected.r === r && selected.c === c;
                const inWord = highlight.has(k);
                const locked = lockedCells.has(k);
                let cls = 'bg-neutral-100';
                if (inWord) cls = 'bg-teal-100';
                if (isSel && !submitted && !locked) cls = 'bg-pink-200 ring-2 ring-pink-500 z-10';
                const val = entries[k] ?? '';
                const graded = submitted && result ? result[k] : null;
                // Box colour: submit grading, or teal for a live-validated (locked) square.
                const gradedBg = graded === true ? CORRECT : graded === false ? WRONG : (locked ? CORRECT : null);
                const whiteLetter = graded !== null || locked;
                return (
                  <div
                    key={k}
                    className={`relative rounded-[3px] border border-neutral-200 ${cls}`}
                    style={{ width: cellSize, height: cellSize, ...(gradedBg ? { backgroundColor: gradedBg } : {}) }}
                  >
                    {cell.number && <span className="pointer-events-none absolute left-[2px] top-[1px] text-[8px] leading-none text-neutral-500">{cell.number}</span>}
                    <input
                      ref={(el) => { inputRefs.current[k] = el; }}
                      value={val}
                      onChange={(e) => onInput(r, c, e.target.value)}
                      onKeyDown={(e) => onKeyDown(r, c, e)}
                      onFocus={() => { selectCell(r, c); revealCell(r, c); }}
                      onClick={() => selectCell(r, c)}
                      disabled={submitted || locked}
                      maxLength={1}
                      autoCapitalize="characters"
                      className={`h-full w-full rounded-[3px] bg-transparent text-center text-[15px] font-bold uppercase caret-transparent focus:outline-none disabled:opacity-100 ${whiteLetter ? 'text-white' : 'text-neutral-800'}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls */}
          {!submitted && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={doSubmit}
                disabled={!allFilled}
                aria-disabled={!allFilled}
                title={allFilled ? '' : 'Fill every square first'}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                  allFilled
                    ? 'bg-teal-300 text-teal-900 active:scale-95'
                    : 'cursor-not-allowed bg-neutral-200 text-neutral-400 opacity-60'
                }`}
              >
                Submit
              </button>
              <button onClick={() => setConfirmClear(true)} className="rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-semibold text-neutral-700 active:scale-95">Clear</button>
            </div>
          )}

          {/* Clues */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[['Across', across], ['Down', down]].map(([label, list]) => (
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

      {/* Clear confirmation */}
      {confirmClear && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="text-sm font-semibold text-neutral-900">Are you sure you want to clear?</p>
            <p className="mt-1 text-sm text-neutral-500">This will clear all placed words and cannot be undone.</p>
            <div className="mt-4 flex gap-2">
              <button onClick={doClear} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white active:scale-95" style={{ backgroundColor: WRONG }}>Clear</button>
              <button onClick={() => setConfirmClear(false)} className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700 active:scale-95">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Result modal (Ducky-Derby style) */}
      {submitted && resultModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-3xl p-6 text-center shadow-2xl" style={{ background: isDark ? '#171717' : '#ffffff' }}>
            <div className="mb-3 flex justify-center"><MiniCrossword won={won} isDark={isDark} /></div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{won ? 'Solved' : 'So close'}</p>
            <p className="mt-2 text-lg font-extrabold" style={{ color: won ? CORRECT : WRONG }}>
              {won ? `Solved! +${pts || 200} pts 🎉` : 'Ahhh that’s a shame.. close though.'}
            </p>
            <button
              onClick={() => setResultModalOpen(false)}
              className="mt-5 block w-full rounded-xl bg-teal-300 py-3 text-base font-semibold text-teal-900 active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
