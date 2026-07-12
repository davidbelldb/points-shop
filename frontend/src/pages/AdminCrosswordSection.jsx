import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { buildLayout, connectivityError } from '../lib/crosswordLayout.js';

const MAX_WORDS = 30;
const inputCls =
  'block w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 focus:border-amber-500 focus:outline-none';

/* Compact preview so David can see the grid his words produce. Blanks render
   as true black squares; filled squares show the solution letter. */
function PreviewGrid({ layout }) {
  if (!layout.rows) return <p className="text-xs text-neutral-500">Add words to preview the grid.</p>;
  const cellPx = Math.max(16, Math.min(30, Math.floor(300 / Math.max(layout.rows, layout.cols))));
  const grid = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const cell = layout.cells[`${r},${c}`];
      grid.push(
        <div
          key={`${r},${c}`}
          className={`relative flex items-center justify-center rounded-[3px] ${cell ? 'bg-neutral-100 border border-neutral-200' : 'bg-black'}`}
          style={{ width: cellPx, height: cellPx }}
        >
          {cell?.number && <span className="absolute left-[1px] top-0 text-[7px] leading-none text-neutral-500">{cell.number}</span>}
          {cell && <span className="text-[11px] font-bold text-neutral-800">{cell.letter}</span>}
        </div>,
      );
    }
  }
  return (
    <div className="inline-block rounded-xl border border-neutral-200 bg-neutral-50 p-2">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${layout.cols}, ${cellPx}px)` }}>{grid}</div>
    </div>
  );
}

export default function AdminCrosswordSection() {
  const [title, setTitle] = useState('Crossword');
  const [words, setWords] = useState([{ word: '', hint: '', direction: 'across' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin.getCrossword()
      .then((cfg) => {
        setTitle(cfg.title ?? 'Crossword');
        setWords(cfg.words?.length ? cfg.words : [{ word: '', hint: '', direction: 'across' }]);
      })
      .catch((e) => setError(e.message));
  }, []);

  const layout = useMemo(() => buildLayout(words), [words]);
  const validationMsg = useMemo(() => connectivityError(words), [words]);

  function update(i, patch) {
    setSaved(false);
    setWords((ws) => ws.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  function addWord() {
    if (words.length >= MAX_WORDS) return;
    setSaved(false);
    setWords((ws) => [...ws, { word: '', hint: '', direction: 'across' }]);
  }
  function removeWord(i) {
    setSaved(false);
    setWords((ws) => (ws.length <= 1 ? ws : ws.filter((_, idx) => idx !== i)));
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false);
    try {
      const cfg = await api.admin.saveCrossword({ title, words });
      setWords(cfg.words?.length ? cfg.words : words);
      setSaved(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        Build the private crossword at <span className="font-mono">/cross-words</span>. Word 1 anchors the grid; each
        later word must share a letter with an earlier one so it can cross. Blank
        squares become black automatically.
      </p>

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

      <div>
        <p className="mb-1 text-xs font-semibold text-neutral-500">Preview</p>
        <PreviewGrid layout={layout} />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !!validationMsg}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save crossword'}
        </button>
        {saved && <span className="text-sm text-amber-700">Saved ✓</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
