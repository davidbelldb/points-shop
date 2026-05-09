import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const ROW_LETTERS = 'ABCDEFGHIJ';
const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";

function rowLetter(r) { return ROW_LETTERS[r] ?? String(r+1); }
function cellLabel(cell) { return rowLetter(cell.r) + (cell.c + 1); }

function parseCoord(s, rows, cols) {
  const m = String(s).trim().match(/^([a-zA-Z])\s*(\d+)$/);
  if (!m) return null;
  const r = m[1].toUpperCase().charCodeAt(0) - 65;
  const c = parseInt(m[2], 10) - 1;
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return { r, c };
}
function parseCoords(input, rows, cols) {
  const parts = String(input || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const cells = parts.map((p) => parseCoord(p, rows, cols));
  if (cells.some((c) => c === null)) return null;
  return cells;
}
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

function MiniGrid({ rows, cols, items, theme }) {
  const owner = {};
  items.forEach((item, idx) => { (item.cells || []).forEach((c) => { owner[`${c.r}-${c.c}`] = idx; }); });
  const fill = theme === 'pink' ? 'bg-pink-300' : 'bg-emerald-300';
  const tiles = [<div key="hc" />];
  for (let c = 0; c < cols; c++) tiles.push(<div key={`h${c}`} className="text-center text-[10px] font-semibold text-neutral-500">{c+1}</div>);
  for (let r = 0; r < rows; r++) {
    tiles.push(<div key={`rl${r}`} className="pr-1 text-right text-[10px] font-semibold text-neutral-500">{rowLetter(r).toLowerCase()}</div>);
    for (let c = 0; c < cols; c++) {
      const has = owner[`${r}-${c}`] !== undefined;
      tiles.push(<div key={`x${r}-${c}`} className={`aspect-square rounded-sm ${has ? fill : 'bg-white border border-neutral-200'}`} />);
    }
  }
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2">
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `1.25rem repeat(${cols}, minmax(0, 1fr))` }}>
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
  const [draft, setDraft] = useState([]);
  const { refresh: refreshBasket } = useBasket();

  async function load(markRead = true) {
    try {
      const data = await api.gsState();
      setState(data);
      if (markRead) {
        await api.gsMarkRead();
        if (refreshBasket) await refreshBasket();
      }
      if (data.match && draft.length === 0) {
        if (data.my_items?.length > 0) {
          setDraft(data.my_items.map((it) => ({
            product_id: it.product_id || '',
            text_label: it.text_label || '',
            coords: (it.cells || []).map(cellLabel).join(', '),
          })));
        } else {
          setDraft([{product_id:'',text_label:'',coords:''},{product_id:'',text_label:'',coords:''},{product_id:'',text_label:'',coords:''}]);
        }
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
  const meName   = players?.me?.name || 'You';
  const otherName= players?.other?.name || 'Them';
  const isInitiator = match?.you_are === 'initiator';
  const kind     = isInitiator ? 'product' : 'forfeit';
  const theme    = isInitiator ? 'pink' : 'green';
  const rows     = match?.grid_rows ?? 6;
  const cols     = match?.grid_cols ?? 6;

  const parsedDraft = useMemo(() => draft.map((row) => {
    const cells = parseCoords(row.coords, rows, cols);
    let err = null;
    if (kind === 'product' && !row.product_id) err = 'Pick a product';
    else if (kind === 'forfeit' && !row.text_label.trim()) err = 'Type a forfeit';
    else if (cells === null) err = 'Invalid coords (e.g. C3, D3, E3)';
    else if (!isContiguousLine(cells)) err = 'Must be one cell or a contiguous line';
    return { ...row, cells: cells || [], err };
  }), [draft, kind, rows, cols]);

  const overlapErr = useMemo(() => {
    const seen = {};
    for (let i = 0; i < parsedDraft.length; i++) {
      for (const c of parsedDraft[i].cells) {
        const k = `${c.r}-${c.c}`;
        if (seen[k] !== undefined) return `Item ${i+1} overlaps item ${seen[k]+1}`;
        seen[k] = i;
      }
    }
    return null;
  }, [parsedDraft]);

  const allValid = parsedDraft.length >= 3 && !overlapErr && parsedDraft.every((r) => !r.err);

  function setRow(i, patch) { setDraft((d) => d.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function addRow()  { setDraft((d) => [...d, { product_id:'', text_label:'', coords:'' }]); }
  function removeRow(i) { setDraft((d) => d.length <= 3 ? d : d.filter((_, idx) => idx !== i)); }

  async function start() {
    if (busy) return; setBusy(true);
    try { await api.gsStart({}); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function saveAndConfirm() {
    if (busy || !allValid) return; setBusy(true);
    try {
      const items = parsedDraft.map((r) => ({
        product_id: kind === 'product' ? r.product_id : null,
        text_label: kind === 'forfeit' ? r.text_label.trim() : null,
        cells: r.cells,
      }));
      await api.gsSetItems(items);
      await api.gsConfirm();
      await load(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function abandon() {
    if (!confirm('Cancel this Giftsweeper match?')) return;
    setBusy(true);
    try { await api.gsAbandon(); setDraft([]); await load(false); }
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
          <p className="mt-1 text-xs text-neutral-400">{rows}x{cols} grid - {match?.cost_per_cell ?? 1} pt per cell guess - both players hide items.</p>
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
    ? <>To get started, <strong>list your products</strong> and their location on the grid.</>
    : <>To get started, <strong>list your forfeits</strong> and their location on the grid.</>;
  const confirmLabel = isInitiator ? 'Confirm products' : 'Confirm forfeits';
  const addLabel = isInitiator ? '+ Add product' : '+ Add forfeit';
  const focusBorder = isInitiator ? 'focus:border-pink-400' : 'focus:border-emerald-400';

  return (
    <div className="space-y-5 py-2">
      <Header canCancel />
      <div className="text-center">
        <h2 className="text-xl font-bold">{heading}</h2>
        <p className="mt-1 text-sm text-neutral-500">{tagline}</p>
      </div>
      <MiniGrid rows={rows} cols={cols} items={parsedDraft} theme={theme} />
      <div className="space-y-4">
        <p className="text-sm font-semibold">{isInitiator ? 'Add products (3 minimum)' : 'Add forfeits (3 minimum)'}</p>
        {parsedDraft.map((row, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {isInitiator ? 'Product' : 'Forfeit'} {i+1}
              </p>
              {parsedDraft.length > 3 && (
                <button onClick={() => removeRow(i)} className="text-xs text-neutral-400 hover:text-red-500">Remove</button>
              )}
            </div>
            {isInitiator ? (
              <select
                value={row.product_id || ''}
                onChange={(e) => setRow(i, { product_id: e.target.value })}
                className={`block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none ${focusBorder}`}
              >
                <option value="">Select product from dropdown</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} - {p.price_points} pts</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={row.text_label}
                onChange={(e) => setRow(i, { text_label: e.target.value })}
                placeholder="Type a forfeit, e.g. I'll kiss you"
                className={`block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none ${focusBorder}`}
              />
            )}
            <input
              type="text"
              value={row.coords}
              onChange={(e) => setRow(i, { coords: e.target.value })}
              placeholder={isInitiator ? 'Product location e.g. C3, D3, E3' : 'Forfeit location e.g. C3, D3, E3'}
              className={`block w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${row.err ? 'border-red-300 focus:border-red-400' : `border-neutral-200 ${focusBorder}`}`}
            />
            {row.err && <p className="text-xs text-red-500">{row.err}</p>}
          </div>
        ))}
        <button onClick={addRow} className="text-sm font-medium text-neutral-500 underline">{addLabel}</button>
      </div>
      {overlapErr && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overlapErr}</div>
      )}
      <button onClick={saveAndConfirm} disabled={!allValid || busy} className={`w-full ${TEAL_BTN}`}>
        {confirmLabel}
      </button>
    </div>
  );
}
