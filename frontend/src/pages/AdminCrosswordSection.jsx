import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { buildLayout, connectivityError } from '../lib/crosswordLayout.js';
import CrosswordMediaManager from './AdminCrosswordMedia.jsx';

const MAX_WORDS = 30;
const MAX_COLS = 18; // hard cap — beyond this the squares get too small to tap on a phone
const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-amber-500 focus:outline-none';

/* Compact preview so David can see the grid his words produce. Blanks render
   as true black squares; filled squares show the solution letter.

   When `placing` is set (an index), the grid becomes interactive: a padding ring
   of empty squares is added around the current grid so a word can be dropped into
   blank space, and tapping any square calls onPlace(normRow, normCol) to pin the
   selected word's start there. The selected word's current cells are ringed. */
function PreviewGrid({ layout, media = [], anchor = { r: 0, c: 0 }, placing = null, onPlace }) {
  const isPlacing = placing != null;

  // No grid yet but placing the first word → offer a blank canvas to drop onto.
  if (!layout.rows) {
    if (!isPlacing) return <p className="text-xs text-neutral-500">Add words to preview the grid.</p>;
    const N = 12, cellPx = 24, cells = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      cells.push(
        <button key={`${r},${c}`} type="button" onClick={() => onPlace(r, c)}
          className="rounded-[3px] bg-black hover:ring-2 hover:ring-amber-400"
          style={{ gridColumn: c + 1, gridRow: r + 1, width: cellPx, height: cellPx }} />,
      );
    }
    return (
      <div className="inline-block rounded-xl border border-neutral-200 bg-neutral-50 p-2">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${N}, ${cellPx}px)`, gridAutoRows: `${cellPx}px` }}>{cells}</div>
      </div>
    );
  }

  const PAD = isPlacing ? 2 : 0;
  const totalCols = layout.cols + 2 * PAD, totalRows = layout.rows + 2 * PAD;
  const cellPx = Math.max(14, Math.min(30, Math.floor(340 / Math.max(totalRows, totalCols))));

  // Cells of the word currently being placed, so we can ring its position.
  const activeCells = new Set();
  if (isPlacing) {
    for (const e of [...layout.across, ...layout.down]) {
      if (e.wordIndex === placing) for (const cc of e.cells) activeCells.add(`${cc.r},${cc.c}`);
    }
  }

  const grid = [];
  for (let r = -PAD; r < layout.rows + PAD; r++) {
    for (let c = -PAD; c < layout.cols + PAD; c++) {
      const cell = layout.cells[`${r},${c}`];
      const gc = c + PAD + 1, gr = r + PAD + 1;
      const base = cell ? 'bg-neutral-100 border border-neutral-200' : 'bg-black';
      const ring = activeCells.has(`${r},${c}`) ? 'ring-2 ring-amber-500' : '';
      const inner = (
        <>
          {cell?.number && <span className="absolute left-[1px] top-0 text-[7px] leading-none text-neutral-500">{cell.number}</span>}
          {cell && <span className="text-[11px] font-bold text-neutral-800">{cell.letter}</span>}
        </>
      );
      grid.push(isPlacing ? (
        <button key={`${r},${c}`} type="button" onClick={() => onPlace(r, c)}
          className={`relative flex items-center justify-center rounded-[3px] ${base} ${ring} hover:ring-2 hover:ring-amber-400`}
          style={{ gridColumn: gc, gridRow: gr, width: cellPx, height: cellPx }}>{inner}</button>
      ) : (
        <div key={`${r},${c}`}
          className={`relative flex items-center justify-center rounded-[3px] ${base}`}
          style={{ gridColumn: gc, gridRow: gr, width: cellPx, height: cellPx }}>{inner}</div>
      ));
    }
  }

  // Media overlays (only in view mode, so they don't block placement taps).
  if (!isPlacing) media.forEach((m) => {
    const w = 2, h = m.type === 'photo' ? 3 : 2;
    if (!m.url && !m.type) return;
    grid.push(
      <div
        key={`m-${m.id}`}
        style={{
          gridColumn: `${(m.col ?? 0) + anchor.c + 1} / span ${w}`,
          gridRow: `${(m.row ?? 0) + anchor.r + 1} / span ${h}`,
          zIndex: 5,
        }}
        className="flex items-center justify-center overflow-hidden rounded-md"
      >
        {m.type === 'photo'
          ? (m.url ? <img src={m.url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-blue-500/70" />)
          : <div className="flex h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: '#ee70bd' }}>
              <svg width={cellPx} height={cellPx} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
            </div>}
      </div>,
    );
  });

  return (
    <div className="inline-block rounded-xl border border-neutral-200 bg-neutral-50 p-2">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${totalCols}, ${cellPx}px)`, gridAutoRows: `${cellPx}px` }}>{grid}</div>
    </div>
  );
}

export default function AdminCrosswordSection() {
  const [title, setTitle] = useState('Crossword');
  const [words, setWords] = useState([{ word: '', hint: '', direction: 'across' }]);
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false); // playable by Katie?
  const [resetMsg, setResetMsg] = useState(null);
  const [placingIdx, setPlacingIdx] = useState(null); // word being hand-placed on the grid

  useEffect(() => {
    api.admin.getCrossword()
      .then((cfg) => {
        setTitle(cfg.title ?? 'Crossword');
        setWords(cfg.words?.length ? cfg.words : [{ word: '', hint: '', direction: 'across' }]);
        setMedia(Array.isArray(cfg.media) ? cfg.media : []);
        setOpen(cfg.open === true);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    try { await api.admin.updateSettings({ crossword_open: next ? 'true' : 'false' }); }
    catch (e) { setError(e.message); setOpen(!next); }
  }

  const layout = useMemo(() => buildLayout(words), [words]);
  // Word 1's cell — media positions are stored relative to it (grid-shift proof).
  const anchor = useMemo(() => {
    const p = layout.placements?.[0];
    return p ? { r: p.startR, c: p.startC } : { r: 0, c: 0 };
  }, [layout]);
  const validationMsg = useMemo(() => connectivityError(words), [words]);
  // Media tiles must sit on blank space and within the grid.
  const mediaMsg = useMemo(() => {
    if (!layout.rows) return null;
    for (const m of media) {
      if (!m.url) continue;
      const w = 2, h = m.type === 'photo' ? 3 : 2;
      const r0 = Math.round(Number(m.row) || 0) + anchor.r, c0 = Math.round(Number(m.col) || 0) + anchor.c;
      if (r0 < 0 || c0 < 0 || r0 + h > layout.rows || c0 + w > layout.cols) {
        return `A ${m.type} tile is off the grid — move it within bounds.`;
      }
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
        if (layout.cells[`${r},${c}`]) return `A ${m.type} tile is covering letter squares — place it on blank space.`;
      }
    }
    return null;
  }, [media, layout, anchor]);

  function update(i, patch) {
    setSaved(false);
    setWords((ws) => ws.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  const isPinned = (w) => Number.isInteger(w?.row) && Number.isInteger(w?.col);
  // Tapped a preview square while placing: pin the selected word's start there.
  // The tap is in normalised grid coords; store in the pre-normalisation frame
  // (add the layout offset) so the position is stable as the grid grows.
  function onPlace(nr, nc) {
    if (placingIdx == null) return;
    update(placingIdx, { row: nr + (layout.offsetR ?? 0), col: nc + (layout.offsetC ?? 0) });
  }
  function addWord() {
    if (words.length >= MAX_WORDS) return;
    setSaved(false);
    setPlacingIdx(null);
    setWords((ws) => [...ws, { word: '', hint: '', direction: 'across' }]);
  }
  function removeWord(i) {
    setSaved(false);
    setPlacingIdx(null);
    setWords((ws) => (ws.length <= 1 ? ws : ws.filter((_, idx) => idx !== i)));
    // Word indexes shift when one is removed — keep media links pointing at the
    // right words: drop links to the removed word, decrement the ones after it.
    setMedia((ms) => ms.map((m) => ({
      ...m,
      words: (m.words || []).filter((wi) => wi !== i).map((wi) => (wi > i ? wi - 1 : wi)),
    })));
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const cfg = await api.admin.saveCrossword({ title, words, media });
      setWords(cfg.words?.length ? cfg.words : words);
      if (Array.isArray(cfg.media)) setMedia(cfg.media);
      setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Build the private crossword at <span className="font-mono">/cross-words</span>. Auto-placed words must share a
        letter with an earlier one so they can cross. Or tap <span className="font-semibold">Place</span> on any word and
        tap a preview square to pin it exactly where you want — handy for filling blank space and keeping the grid narrow.
        Blank squares become black automatically.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-neutral-800">Playable by Katie</p>
          <p className="text-xs text-neutral-500">Off = only you can open /cross-words. On = Katie can play it for 200 pts.</p>
        </div>
        <button
          onClick={toggleOpen}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${open ? 'bg-amber-500 text-white' : 'bg-neutral-200 text-neutral-700'}`}
        >
          {open ? 'On' : 'Off'}
        </button>
      </div>

      <div>
        <label className="text-xs font-semibold text-neutral-500">Title</label>
        <input className={`${inputCls} mt-1`} value={title} onChange={(e) => { setSaved(false); setTitle(e.target.value); }} />
      </div>

      <div className="space-y-2">
        {words.map((w, i) => (
          <div key={i} className="flex items-start gap-2 rounded-xl border border-neutral-200 p-2">
            <span className="mt-2 w-5 shrink-0 text-center text-xs font-semibold text-neutral-400">{i + 1}</span>
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                className={inputCls}
                placeholder="Word"
                value={w.word}
                onChange={(e) => update(i, { word: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Hint / clue"
                value={w.hint}
                onChange={(e) => update(i, { hint: e.target.value })}
              />
              <select
                className={`${inputCls} sm:w-28`}
                value={w.direction}
                onChange={(e) => update(i, { direction: e.target.value })}
              >
                <option value="across">Across</option>
                <option value="down">Down</option>
              </select>
            </div>
            <div className="mt-0.5 flex shrink-0 flex-col items-stretch gap-1">
              {placingIdx === i ? (
                <button type="button" onClick={() => setPlacingIdx(null)} className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-white">Done</button>
              ) : (
                <button type="button" onClick={() => setPlacingIdx(i)} className="rounded-md bg-neutral-700 px-2 py-1 text-[11px] font-semibold text-white">{isPinned(w) ? 'Move' : 'Place'}</button>
              )}
              {isPinned(w) && (
                <button type="button" onClick={() => update(i, { row: undefined, col: undefined })} className="rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600">Auto</button>
              )}
            </div>
            <button
              onClick={() => removeWord(i)}
              disabled={words.length <= 1}
              aria-label="Remove word"
              className="mt-1 shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600 disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addWord}
        disabled={words.length >= MAX_WORDS}
        className="w-full rounded-xl border-2 border-dashed border-neutral-300 py-2 text-sm font-semibold text-neutral-600 active:scale-[0.99] disabled:opacity-40"
      >
        + Add word{words.length >= MAX_WORDS ? ' (max 30)' : ''}
      </button>

      {/* Live validation + unplaced warnings */}
      {validationMsg && <p className="text-sm text-red-600">{validationMsg}</p>}
      {!validationMsg && layout.unplaced.length > 0 && (
        <p className="text-sm text-red-600">
          Couldn’t place: {layout.unplaced.map((u) => u.word).join(', ')}. Try a different word order or direction so it can cross.
        </p>
      )}
      {!validationMsg && mediaMsg && <p className="text-sm text-red-600">{mediaMsg}</p>}
      {layout.cols > MAX_COLS && (
        <p className="text-sm text-red-600">
          This grid is {layout.cols} columns wide — the maximum is {MAX_COLS} (any wider and the squares get too small to tap). Move a word or use more down words to bring it in before saving.
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-500">
          Preview{placingIdx != null && words[placingIdx] ? ` — tap a square to set where “${words[placingIdx].word || 'this word'}” starts (${words[placingIdx].direction}); use its Across/Down control to rotate` : ''}
        </p>
        <PreviewGrid layout={layout} media={media} anchor={anchor} placing={placingIdx} onPlace={onPlace} />
      </div>

      <div className="border-t border-neutral-200 pt-3">
        <CrosswordMediaManager words={words} media={media} setMedia={setMedia} anchor={anchor} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !!validationMsg || !!mediaMsg || layout.unplaced.length > 0 || layout.cols > MAX_COLS}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save crossword'}
        </button>
        {saved && <span className="text-sm text-amber-700">Saved ✓</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Reset play — clears everyone's board so it can be attempted fresh.
          Players can't reset in-game; only you can, here. */}
      <div className="border-t border-neutral-200 pt-3">
        <button
          onClick={async () => {
            if (!confirm("Reset everyone's crossword play? This clears all placed answers so it can be attempted fresh.")) return;
            try { await api.admin.resetCrosswordProgress(); setResetMsg('Play reset ✓'); setTimeout(() => setResetMsg(null), 2000); }
            catch (e) { setError(e.message); }
          }}
          className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          Reset everyone’s play
        </button>
        {resetMsg && <span className="ml-3 text-sm text-amber-700">{resetMsg}</span>}
      </div>
    </div>
  );
}
