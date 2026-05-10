import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const ROW_LETTERS = 'ABCDEFGHIJ';
const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";

function rowLetter(r) { return ROW_LETTERS[r] ?? String(r+1); }
function cellLabel(cell) { return rowLetter(cell.r) + (cell.c + 1); }

function isContiguousLine(cells) {
  if (!cells || cells.length === 0) return false;
  if (cells.length === 1) return true;
  const sameR = cells.every((c) => c.r === cells[0].r);
  const sameC = cells.every((c) => c.c === cells[0].c);
  if (!sameR && !sameC) return false;
  const sorted = cells.slice().sort((a,b) => sameR ? a.c - b.c : a.r - b.r);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sameR ? sorted[i].c - sorted[i-1].c : sorted[i].r - sorted[i-1].r;
    if (diff !== 1) return false;
  }
  return true;
}

function PlayGrid({ rows, cols, items, selection, theme, onTapCell, readOnly }) {
  const owner = {};
  items.forEach((item, idx) => { (item.cells || []).forEach((c) => { owner[`${c.r}-${c.c}`] = idx; }); });
  const sel = new Set((selection || []).map((c) => `${c.r}-${c.c}`));
  const lockedFill   = theme === 'pink' ? 'bg-pink-300'  : 'bg-emerald-300';
  const selectedFill = theme === 'pink' ? 'bg-pink-100 ring-2 ring-pink-500' : 'bg-emerald-100 ring-2 ring-emerald-500';
  const tiles = [<div key="hc" />];
  for (let c = 0; c < cols; c++) {
    tiles.push(<div key={`h${c}`} className="text-center text-[11px] font-semibold text-neutral-500">{c+1}</div>);
  }
  for (let r = 0; r < rows; r++) {
    tiles.push(<div key={`rl${r}`} className="pr-1 text-right text-[11px] font-semibold text-neutral-500">{rowLetter(r).toLowerCase()}</div>);
    for (let c = 0; c < cols; c++) {
      const k = `${r}-${c}`;
      const occupied = owner[k] !== undefined;
      const selected = sel.has(k);
      let cls = 'bg-white border border-neutral-200';
      if (occupied) cls = `${lockedFill}`;
      else if (selected) cls = selectedFill;
      tiles.push(
        <button
          key={`x${k}`}
          type="button"
          onClick={() => !readOnly && !occupied && onTapCell?.(r, c)}
          disabled={readOnly || occupied}
          className={`aspect-square rounded transition active:scale-95 ${cls} disabled:cursor-default`}
          aria-label={`${rowLetter(r)}${c+1}${occupied ? ' assigned' : selected ? ' selected' : ''}`}
        />
      );
    }
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, minmax(0, 1fr))` }}>
        {tiles}
      </div>
    </div>
  );
}

export default function GiftsweeperPage() {
  const [state, setState] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [assignProductId, setAssignProductId] = useState('');
  const [assignText, setAssignText] = useState('');
  const { refresh: refreshBasket } = useBasket();

  async function load(markRead = true) {
    try {
      const data = await api.gsState();
      setState(data);
      if (markRead) {
        await api.gsMarkRead();
        if (refreshBasket) await refreshBasket();
      }
    } catch (e) { setError(e.message); }
  }

  useEffect(() => {
    load(true);
    api.listProducts().then(setProducts).catch(() => {});
    const id = setInterval(() => load(true), 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const match    = state?.match ?? null;
  const players  = state?.players ?? null;
  const myItems  = state?.my_items ?? [];
  const meName   = players?.me?.name || 'You';
  const otherName= players?.other?.name || 'Them';
  const isInitiator = match?.you_are === 'initiator';
  const theme    = isInitiator ? 'pink' : 'green';
  const rows     = match?.grid_rows ?? 6;
  const cols     = match?.grid_cols ?? 6;

  const selectionContig = useMemo(() => isContiguousLine(selection), [selection]);
  const canAssign = selection.length > 0 && selectionContig;

  function toggleCell(r, c) {
    setSelection((s) => {
      const i = s.findIndex((x) => x.r === r && x.c === c);
      if (i >= 0) return s.filter((_, idx) => idx !== i);
      return [...s, { r, c }];
    });
  }

  function openAssign() {
    if (!canAssign) return;
    setAssignProductId('');
    setAssignText('');
    setShowAssign(true);
  }

  async function submitAssign() {
    if (busy) return;
    if (isInitiator && !assignProductId) return;
    if (!isInitiator && !assignText.trim()) return;
    setBusy(true);
    try {
      await api.gsAddItem({
        product_id: isInitiator ? assignProductId : null,
        text_label: isInitiator ? null : assignText.trim(),
        cells: selection,
      });
      setSelection([]);
      setShowAssign(false);
      await load(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function removeItem(id) {
    if (!confirm('Remove this item?')) return;
    setBusy(true);
    try { await api.gsRemoveItem(id); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    try { await api.gsStart({}); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function confirmGrid() {
    if (busy || myItems.length < 3) return;
    setBusy(true);
    try { await api.gsConfirm(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function abandon() {
    if (!confirm('Cancel this Giftsweeper match?')) return;
    setBusy(true);
    try { await api.gsAbandon(); setSelection([]); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function Header({ canCancel }) {
    return (
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Giftsweeper</h1>
        {canCancel ? (
          <button onClick={abandon} disabled={busy} className="text-sm font-medium text-neutral-500 disabled:opacity-30">Cancel</button>
        ) : <span className="w-10" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!state) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">Loading...</div>;

  if (!match) {
    return (
      <div className="space-y-5 py-2">
        <Header canCancel={false} />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-500">No active match.</p>
          <p className="mt-1 text-xs text-neutral-400">{rows}x{cols} grid - 1 pt per cell guess - both players hide items.</p>
          <button onClick={start} disabled={busy || !players?.other} className={`mt-4 ${TEAL_BTN}`}>
            Start a Giftsweeper match
          </button>
        </div>
      </div>
    );
  }

  if (match.my_setup_done && !match.other_setup_done) {
    return (
      <div className="space-y-5 py-2">
        <Header canCancel />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <h2 className="text-base font-semibold">Grid confirmed.</h2>
          <p className="mt-1 text-sm text-neutral-500">Waiting for <span className="font-semibold">{otherName}</span> to finalise their grid.</p>
        </div>
      </div>
    );
  }

  if (match.started) {
    return (
      <div className="space-y-5 py-2">
        <Header canCancel />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <h2 className="text-base font-semibold">Match ready</h2>
          <p className="mt-1 text-sm text-neutral-500">Both grids confirmed. Play loop is the next build.</p>
        </div>
      </div>
    );
  }

  const heading = `${meName}'s Grid`;
  const tagline = isInitiator
    ? <>Tap cells on the grid to place a <strong>product</strong>, then assign.</>
    : <>Tap cells on the grid to place a <strong>forfeit</strong>, then assign.</>;
  const assignBtnLabel = isInitiator ? 'Assign product' : 'Assign forfeit';
  const confirmLabel = isInitiator ? 'Confirm products' : 'Confirm forfeits';
  const itemsHeading = isInitiator
    ? `Products (${myItems.length}/3 minimum)`
    : `Forfeits (${myItems.length}/3 minimum)`;

  return (
    <div className="space-y-5 py-2">
      <Header canCancel />
      <div className="text-center">
        <h2 className="text-xl font-bold">{heading}</h2>
        <p className="mt-1 text-sm text-neutral-500">{tagline}</p>
      </div>

      <PlayGrid
        rows={rows}
        cols={cols}
        items={myItems}
        selection={selection}
        theme={theme}
        onTapCell={toggleCell}
      />

      <div className="text-center text-xs">
        {selection.length === 0 && (
          <span className="text-neutral-400">Tap empty cells to start placing an item.</span>
        )}
        {selection.length > 0 && selectionContig && (
          <span className="font-medium text-neutral-600">
            {selection.length} cell{selection.length === 1 ? '' : 's'} selected: {selection.slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}
          </span>
        )}
        {selection.length > 0 && !selectionContig && (
          <span className="font-medium text-red-500">Selection must be one cell or a contiguous line (no gaps, no L-shapes).</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSelection([])}
          disabled={selection.length === 0}
          className="flex-1 rounded-xl border border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700 disabled:opacity-30"
        >Clear</button>
        <button
          onClick={openAssign}
          disabled={!canAssign || busy}
          className={`flex-1 ${TEAL_BTN}`}
        >{assignBtnLabel}</button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{itemsHeading}</p>
        {myItems.length === 0 ? (
          <p className="text-xs text-neutral-400">Nothing assigned yet.</p>
        ) : (
          <ul className="space-y-2">
            {myItems.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {isInitiator ? (it.product_name || 'Product') : (it.text_label || 'Forfeit')}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {(it.cells || []).slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}
                  </p>
                </div>
                <button onClick={() => removeItem(it.id)} disabled={busy} className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500 disabled:opacity-30">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {myItems.length >= 3 && (
        <button onClick={confirmGrid} disabled={busy} className={`w-full ${TEAL_BTN}`}>
          {confirmLabel}
        </button>
      )}

      {showAssign && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">{isInitiator ? 'Assign a product' : 'Assign a forfeit'}</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {selection.length} cell{selection.length === 1 ? '' : 's'}: {selection.slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}
            </p>
            <div className="mt-4">
              {isInitiator ? (
                <select
                  value={assignProductId}
                  onChange={(e) => setAssignProductId(e.target.value)}
                  className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none"
                >
                  <option value="">Select a product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} - {p.price_points} pts</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={assignText}
                  onChange={(e) => setAssignText(e.target.value)}
                  placeholder="e.g. I'll make you a cheesecake"
                  className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  autoFocus
                />
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowAssign(false)} disabled={busy} className="flex-1 rounded-xl border border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700 disabled:opacity-30">Cancel</button>
              <button
                onClick={submitAssign}
                disabled={busy || (isInitiator ? !assignProductId : !assignText.trim())}
                className={`flex-1 ${TEAL_BTN}`}
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
