import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

const ROW_LETTERS = 'ABCDEFGHIJ';
const TEAL_BTN = "inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40";
const PALE_BTN = "flex-1 rounded-xl border border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700 disabled:opacity-30";

function rowLetter(r) { return ROW_LETTERS[r] ?? String(r+1); }
function cellLabel(cell) { return rowLetter(cell.r) + (cell.c + 1); }
function isContiguous(cells) {
  if (!cells || cells.length === 0) return false;
  if (cells.length === 1) return true;
  const set = new Set(cells.map((c) => `${c.r}-${c.c}`));
  const visited = new Set();
  const start = `${cells[0].r}-${cells[0].c}`;
  visited.add(start);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift();
    const [r, c] = k.split('-').map(Number);
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nk = `${r+dr}-${c+dc}`;
      if (set.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
    }
  }
  return visited.size === cells.length;
}

function SetupGrid({ rows, cols, items, selection, theme, onTapCell }) {
  const owner = {};
  items.forEach((it, i) => (it.cells || []).forEach((c) => { owner[`${c.r}-${c.c}`] = i; }));
  const sel = new Set((selection||[]).map((c) => `${c.r}-${c.c}`));
  const lockedFill   = theme === 'pink' ? 'bg-pink-300'  : 'bg-emerald-300';
  const selectedFill = theme === 'pink' ? 'bg-pink-100 ring-2 ring-pink-500' : 'bg-emerald-100 ring-2 ring-emerald-500';
  const tiles = [<div key="hc" />];
  for (let c = 0; c < cols; c++) tiles.push(<div key={`h${c}`} className="text-center text-[11px] font-semibold text-neutral-500">{c+1}</div>);
  for (let r = 0; r < rows; r++) {
    tiles.push(<div key={`rl${r}`} className="pr-1 text-right text-[11px] font-semibold text-neutral-500">{rowLetter(r).toLowerCase()}</div>);
    for (let c = 0; c < cols; c++) {
      const k = `${r}-${c}`;
      const occupied = owner[k] !== undefined;
      const selected = sel.has(k);
      let cls = 'bg-white border border-neutral-200';
      if (occupied) cls = lockedFill;
      else if (selected) cls = selectedFill;
      tiles.push(<button key={`x${k}`} type="button" onClick={() => !occupied && onTapCell?.(r,c)} disabled={occupied}
        className={`aspect-square rounded transition active:scale-95 ${cls} disabled:cursor-default`} />);
    }
  }
  return <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2"><div className="grid gap-[3px]" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, minmax(0, 1fr))` }}>{tiles}</div></div>;
}

function OppGrid({ rows, cols, guesses, selection, theme, onTapCell, disabled }) {
  const gMap = {}; guesses.forEach((g) => { gMap[`${g.r}-${g.c}`] = g; });
  const sel = new Set((selection||[]).map((c) => `${c.r}-${c.c}`));
  const revealedFill = theme === 'pink' ? 'bg-pink-400' : 'bg-emerald-500';
  const partialFill  = theme === 'pink' ? 'bg-pink-200' : 'bg-emerald-200';
  const partialText  = theme === 'pink' ? 'text-pink-700' : 'text-emerald-700';
  const selFill      = theme === 'pink' ? 'bg-pink-100 ring-2 ring-pink-500' : 'bg-emerald-100 ring-2 ring-emerald-500';
  const tiles = [<div key="hc" />];
  for (let c = 0; c < cols; c++) tiles.push(<div key={`h${c}`} className="text-center text-[11px] font-semibold text-neutral-500">{c+1}</div>);
  for (let r = 0; r < rows; r++) {
    tiles.push(<div key={`rl${r}`} className="pr-1 text-right text-[11px] font-semibold text-neutral-500">{rowLetter(r).toLowerCase()}</div>);
    for (let c = 0; c < cols; c++) {
      const k = `${r}-${c}`;
      const guess = gMap[k];
      const selected = sel.has(k);
      let cls = 'bg-white border border-neutral-200';
      let content = null;
      if (guess) {
        if (guess.hit && guess.item_revealed) cls = revealedFill;
        else if (guess.hit) { cls = partialFill; content = <span className={`text-xs font-bold ${partialText}`}>{'\u2713'}</span>; }
        else { cls = 'bg-neutral-100'; content = <span className="text-xs text-neutral-400">{'\u2715'}</span>; }
      } else if (selected) cls = selFill;
      const cellDisabled = disabled || !!guess;
      tiles.push(<button key={`x${k}`} type="button" onClick={() => !cellDisabled && onTapCell?.(r,c)} disabled={cellDisabled}
        className={`aspect-square rounded transition active:scale-95 flex items-center justify-center ${cls} disabled:cursor-default`}>{content}</button>);
    }
  }
  return <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2"><div className="grid gap-[3px]" style={{ gridTemplateColumns: `1.5rem repeat(${cols}, minmax(0, 1fr))` }}>{tiles}</div></div>;
}

function MyMiniGrid({ rows, cols, myItems, oppMarks, theme }) {
  const occ = {}; myItems.forEach((it, i) => (it.cells || []).forEach((c) => { occ[`${c.r}-${c.c}`] = i; }));
  const oppMap = {}; oppMarks.forEach((m) => { oppMap[`${m.r}-${m.c}`] = m; });
  const myFill = theme === 'pink' ? 'bg-pink-300' : 'bg-emerald-300';
  const hitFill = theme === 'pink' ? 'bg-pink-500' : 'bg-emerald-600';
  const missFill = 'bg-neutral-300';
  const tiles = [<div key="hc" />];
  for (let c = 0; c < cols; c++) tiles.push(<div key={`h${c}`} className="text-center text-[10px] font-semibold text-neutral-500">{c+1}</div>);
  for (let r = 0; r < rows; r++) {
    tiles.push(<div key={`rl${r}`} className="pr-1 text-right text-[10px] font-semibold text-neutral-500">{rowLetter(r).toLowerCase()}</div>);
    for (let c = 0; c < cols; c++) {
      const k = `${r}-${c}`;
      const isMine = occ[k] !== undefined;
      const oppMark = oppMap[k];
      let cls = 'bg-white border border-neutral-200';
      if (isMine && oppMark?.hit) cls = hitFill;
      else if (isMine) cls = myFill;
      else if (oppMark) cls = missFill;
      tiles.push(<div key={`x${k}`} className={`aspect-square rounded ${cls}`} />);
    }
  }
  return <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2"><div className="grid gap-[2px]" style={{ gridTemplateColumns: `1rem repeat(${cols}, minmax(0, 1fr))` }}>{tiles}</div></div>;
}

function ResultModal({ result, oppTheme, onClose }) {
  const { results, newly_won_items, charged_points, my_balance, match_finished } = result;
  const hits = results.filter((r) => r.hit);
  const misses = results.filter((r) => !r.hit);
  const wonItemIds = new Set((newly_won_items || []).map((w) => w.id));
  const partialHits = hits.filter((h) => h.item_id && !wonItemIds.has(h.item_id));
  const wonAny = (newly_won_items || []).length > 0;
  const headline = wonAny ? "It's yours!" : (hits.length > 0 ? "It's a hit!" : "It's a miss!");
  const headlineColor = wonAny ? 'text-teal-700' : (hits.length > 0 ? (oppTheme === 'pink' ? 'text-pink-700' : 'text-emerald-700') : 'text-neutral-700');
  const partialGroups = Object.values(partialHits.reduce((acc, h) => {
    const k = h.item_id;
    if (!acc[k]) acc[k] = { label: h.item_label, progress: h.item_progress, cells: [] };
    acc[k].cells.push(h);
    return acc;
  }, {}));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className={`text-center text-2xl font-bold tracking-tight ${headlineColor}`}>{headline}</h2>
        <div className="mt-4 space-y-2 text-sm">
          {wonAny && (
            <div className="rounded-xl bg-teal-50 p-3">
              <p className="font-semibold text-teal-900">You won:</p>
              <ul className="mt-1 space-y-1">
                {newly_won_items.map((it) => <li key={it.id} className="text-teal-800">- {it.label}</li>)}
              </ul>
            </div>
          )}
          {partialGroups.length > 0 && (
            <div className="space-y-1">
              {partialGroups.map((g, i) => (
                <p key={i} className="text-neutral-700">
                  Hit on {g.cells.map(cellLabel).join(', ')} - part of <strong>{g.label || 'an item'}</strong>
                  {g.progress ? <span className="text-neutral-500"> ({g.progress.current}/{g.progress.total} cells revealed)</span> : null}
                </p>
              ))}
            </div>
          )}
          {misses.length > 0 && (
            <p className="text-neutral-500">
              Miss{misses.length === 1 ? '' : 'es'}: {misses.map(cellLabel).join(', ')}
            </p>
          )}
        </div>
        <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-center text-xs text-neutral-500">
          Charged <strong>{charged_points} pt{charged_points === 1 ? '' : 's'}</strong>. Balance: <strong>{my_balance} pts</strong>.
        </div>
        {match_finished && <p className="mt-3 text-center text-sm font-semibold text-teal-700">Match over!</p>}
        <button onClick={onClose} className={`mt-4 w-full ${TEAL_BTN}`}>Continue</button>
      </div>
    </div>
  );
}

export default function GiftsweeperPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [setupSelection, setSetupSelection] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [assignProductId, setAssignProductId] = useState('');
  const [assignText, setAssignText] = useState('');
  const [playSelection, setPlaySelection] = useState([]);
  const [showResult, setShowResult] = useState(null);
  const [endModalAcked, setEndModalAcked] = useState(false);
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

  useEffect(() => {
    const m = state?.match;
    if (!m?.finished || !m.id) return;
    const acked = localStorage.getItem(`gs_match_acked_${m.id}`);
    setEndModalAcked(!!acked);
  }, [state?.match?.id, state?.match?.finished]);

  const match    = state?.match ?? null;
  const players  = state?.players ?? null;
  const myItems  = state?.my_items ?? [];
  const meName   = players?.me?.name || 'You';
  const otherName= players?.other?.name || 'Them';
  const isAdmin  = players?.me?.role === 'admin';
  const myKind   = isAdmin ? 'product' : 'forfeit';
  const oppKind  = isAdmin ? 'forfeit' : 'product';
  const myTheme  = isAdmin ? 'pink' : 'green';
  const oppTheme = isAdmin ? 'green' : 'pink';
  const rows     = match?.grid_rows ?? 6;
  const cols     = match?.grid_cols ?? 6;

  const setupContig = useMemo(() => isContiguous(setupSelection), [setupSelection]);
  const canAssign = setupSelection.length > 0 && setupContig;

  function tapSetupCell(r, c) {
    setSetupSelection((s) => {
      const i = s.findIndex((x) => x.r === r && x.c === c);
      if (i >= 0) return s.filter((_, idx) => idx !== i);
      return [...s, { r, c }];
    });
  }
  function openAssign() { if (!canAssign) return; setAssignProductId(''); setAssignText(''); setShowAssign(true); }
  async function submitAssign() {
    if (busy) return;
    if (isAdmin && !assignProductId) return;
    if (!isAdmin && !assignText.trim()) return;
    setBusy(true);
    try {
      await api.gsAddItem({
        product_id: isAdmin ? assignProductId : null,
        text_label: isAdmin ? null : assignText.trim(),
        cells: setupSelection,
      });
      setSetupSelection([]); setShowAssign(false);
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
    if (busy) return; setBusy(true);
    try { await api.gsStart({}); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function confirmGrid() {
    if (busy || myItems.length < 3) return; setBusy(true);
    try { await api.gsConfirm(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function abandon() {
    if (!confirm('Cancel this Giftsweeper match?')) return;
    setBusy(true);
    try { await api.gsAbandon(); setSetupSelection([]); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function tapPlayCell(r, c) {
    if (!match?.current_turn_is_me) return;
    setPlaySelection((s) => {
      const i = s.findIndex((x) => x.r === r && x.c === c);
      if (i >= 0) return s.filter((_, idx) => idx !== i);
      return [...s, { r, c }];
    });
  }
  async function submitGuess() {
    const cost = playSelection.length * (match?.cost_per_cell || 1);
    if (busy || playSelection.length === 0) return;
    if ((match?.my_balance ?? 0) < cost) return;
    setBusy(true);
    try {
      const result = await api.gsGuess(playSelection);
      setShowResult(result);
      setPlaySelection([]);
      await load(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function grovel() {
    if (!confirm('Grovel and forfeit the match?')) return;
    setBusy(true);
    try { await api.gsGrovel(); await load(false); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function ackEndModal() {
    if (match?.id) localStorage.setItem(`gs_match_acked_${match.id}`, '1');
    setEndModalAcked(true);
    navigate('/');
  }

  function Header({ canCancel }) {
    return (
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Giftsweeper</h1>
        {canCancel
          ? <button onClick={abandon} disabled={busy} className="text-sm font-medium text-neutral-500 disabled:opacity-30">Cancel</button>
          : <span className="w-10" />}
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

  if (!match || (match.finished && endModalAcked)) {
    return (
      <div className="space-y-5 py-2">
        <Header canCancel={false} />
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-500">No active match.</p>
          <p className="mt-1 text-xs text-neutral-400">{rows}x{cols} grid - {match?.cost_per_cell ?? 1} pt per cell guess.</p>
          <button onClick={start} disabled={busy || !players?.other} className={`mt-4 ${TEAL_BTN}`}>Start a Giftsweeper match</button>
        </div>
      </div>
    );
  }

  if (match.finished) {
    const oppGrid = state.opp_grid;
    const myGrid  = state.my_grid;
    return (
      <div className="space-y-5 py-2">
        <Header canCancel={false} />
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-xl font-bold">Match over</h2>
            <p className="mt-1 text-sm text-neutral-500">Won items have been added to your rewards.</p>
            <p className="mt-3 text-sm">You revealed <strong>{oppGrid?.items_revealed || 0}/{oppGrid?.items_total || 0}</strong>.</p>
            <p className="text-sm">{otherName} revealed <strong>{myGrid?.items_revealed || 0}/{myGrid?.items_total || 0}</strong>.</p>
            <button onClick={ackEndModal} className={`mt-5 w-full ${TEAL_BTN}`}>Return home</button>
          </div>
        </div>
      </div>
    );
  }

  if (!match.started && match.my_setup_done && !match.other_setup_done) {
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

  if (!match.started) {
    const tagline = isAdmin
      ? <>Tap cells to place a <strong>product</strong>, then assign.</>
      : <>Tap cells to place a <strong>forfeit</strong>, then assign.</>;
    const assignBtnLabel = isAdmin ? 'Assign product' : 'Assign forfeit';
    const confirmLabel = isAdmin ? 'Confirm products' : 'Confirm forfeits';
    const itemsHeading = isAdmin ? `Products (${myItems.length}/3 minimum)` : `Forfeits (${myItems.length}/3 minimum)`;

    return (
      <div className="space-y-5 py-2">
        <Header canCancel />
        <div className="text-center">
          <h2 className="text-xl font-bold">{meName}'s Grid</h2>
          <p className="mt-1 text-sm text-neutral-500">{tagline}</p>
        </div>
        <SetupGrid rows={rows} cols={cols} items={myItems} selection={setupSelection} theme={myTheme} onTapCell={tapSetupCell} />
        <div className="text-center text-xs">
          {setupSelection.length === 0 && <span className="text-neutral-400">Tap empty cells to start placing an item.</span>}
          {setupSelection.length > 0 && setupContig && (
            <span className="font-medium text-neutral-600">
              {setupSelection.length} cell{setupSelection.length === 1 ? '' : 's'}: {setupSelection.slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}
            </span>
          )}
          {setupSelection.length > 0 && !setupContig && (
            <span className="font-medium text-red-500">Item placements cannot contain gaps.</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSetupSelection([])} disabled={setupSelection.length === 0} className={PALE_BTN}>Clear</button>
          <button onClick={openAssign} disabled={!canAssign || busy} className={`flex-1 ${TEAL_BTN}`}>{assignBtnLabel}</button>
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
                    <p className="truncate text-sm font-medium">{isAdmin ? (it.product_name || 'Product') : (it.text_label || 'Forfeit')}</p>
                    <p className="text-xs text-neutral-500">{(it.cells || []).slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}</p>
                  </div>
                  <button onClick={() => removeItem(it.id)} disabled={busy} className="shrink-0 text-xs font-medium text-neutral-400 hover:text-red-500 disabled:opacity-30">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {myItems.length >= 3 && (
          <button onClick={confirmGrid} disabled={busy} className={`w-full ${TEAL_BTN}`}>{confirmLabel}</button>
        )}
        {showAssign && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold">{isAdmin ? 'Assign a product' : 'Assign a forfeit'}</h3>
              <p className="mt-1 text-xs text-neutral-500">
                {setupSelection.length} cell{setupSelection.length === 1 ? '' : 's'}: {setupSelection.slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}
              </p>
              <div className="mt-4">
                {isAdmin ? (
                  <select value={assignProductId} onChange={(e) => setAssignProductId(e.target.value)} className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-pink-400 focus:outline-none">
                    <option value="">Select a product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} - {p.price_points} pts</option>)}
                  </select>
                ) : (
                  <input type="text" value={assignText} onChange={(e) => setAssignText(e.target.value)} placeholder="e.g. I'll make you a cheesecake" className="block w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none" autoFocus />
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setShowAssign(false)} disabled={busy} className={PALE_BTN}>Cancel</button>
                <button onClick={submitAssign} disabled={busy || (isAdmin ? !assignProductId : !assignText.trim())} className={`flex-1 ${TEAL_BTN}`}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PLAY
  const oppGrid = state.opp_grid;
  const myGrid  = state.my_grid;
  const isMyTurn = match.current_turn_is_me;
  const cost = playSelection.length * (match.cost_per_cell || 1);
  const balance = match.my_balance ?? 0;
  const canAfford = balance >= cost;
  const canSubmit = isMyTurn && playSelection.length > 0 && canAfford;
  const cantPlay = isMyTurn && balance < (match.cost_per_cell || 1);
  const oppKindPlural = oppKind === 'product' ? 'products' : 'forfeits';
  const myKindPlural = myKind === 'product' ? 'products' : 'forfeits';

  return (
    <div className="space-y-5 py-2">
      <Header canCancel />
      <div className="text-center">
        <h2 className="text-xl font-bold">Giftsweeper</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {isMyTurn
            ? <>Select position(s) on the grid. Each position costs <strong>{match.cost_per_cell || 1} point{(match.cost_per_cell||1) === 1 ? '' : 's'}</strong>.</>
            : <>Waiting for <span className="font-semibold">{otherName}</span> to take their turn...</>}
        </p>
        <p className="mt-1 text-xs text-neutral-400">Your balance: <strong>{balance} pts</strong></p>
      </div>

      <OppGrid rows={rows} cols={cols} guesses={oppGrid?.guesses || []} selection={playSelection} theme={oppTheme} onTapCell={tapPlayCell} disabled={!isMyTurn} />

      <div className="text-center text-xs text-neutral-500">
        You have discovered <strong>{oppGrid?.items_revealed || 0}/{oppGrid?.items_total || 0}</strong> {oppKindPlural}
      </div>

      <hr className="border-neutral-200" />

      <div className="text-center text-xs text-neutral-500">
        {otherName} has discovered <strong>{myGrid?.items_revealed || 0}/{myGrid?.items_total || 0}</strong> of your {myKindPlural}
      </div>
      <MyMiniGrid rows={rows} cols={cols} myItems={myItems} oppMarks={myGrid?.marks || []} theme={myTheme} />

      {playSelection.length > 0 && (
        <div className="text-center text-sm">
          {playSelection.slice().sort((a,b)=>a.r-b.r||a.c-b.c).map(cellLabel).join(', ')}{' '}
          this turn will cost you <strong>{cost} point{cost === 1 ? '' : 's'}</strong>.
        </div>
      )}
      {playSelection.length > 0 && !canAfford && (
        <p className="text-center text-xs text-red-500">Not enough points - clear or shrink your selection.</p>
      )}

      <div className="flex gap-2">
        <button onClick={() => setPlaySelection([])} disabled={playSelection.length === 0 || !isMyTurn} className={PALE_BTN}>Clear</button>
        <button onClick={submitGuess} disabled={!canSubmit || busy} className={`flex-1 ${TEAL_BTN}`}>Submit</button>
      </div>

      {cantPlay && (
        <button onClick={grovel} disabled={busy} className="w-full rounded-xl border border-neutral-300 bg-white py-2 text-sm font-medium text-neutral-700">
          Grovel - you don't have enough points to play
        </button>
      )}

      {showResult && (
        <ResultModal result={showResult} oppTheme={oppTheme} onClose={() => setShowResult(null)} />
      )}
    </div>
  );
}
