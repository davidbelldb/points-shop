/**
 * Sneaky Spreadsheets — shared multi-tab workbook on Handsontable.
 *
 * Free for this app: Handsontable's non-commercial license covers personal,
 * non-revenue projects via licenseKey 'non-commercial-and-evaluation'.
 *
 * - Tabs: add (+), rename (double-tap a tab), delete (× on the active tab)
 * - Columns: double-tap a column header to rename it; right-click for the
 *   context menu (insert/remove rows & columns)
 * - Autosaves (debounced) — whole-tab, last-write-wins
 * - Light/dark via Handsontable's built-in themes, following the app theme
 *
 * This page is lazy-loaded from main.jsx so the Handsontable bundle is only
 * fetched when someone actually opens /sneakyspreadsheets.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Handsontable from 'handsontable';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { api } from '../lib/api.js';
import { useTheme } from '../lib/ThemeContext.jsx';

registerAllModules();

/** Trim trailing all-empty rows (minSpareRows keeps appending blanks). */
function trimData(rows) {
  const out = [...rows];
  while (out.length > 1 && out[out.length - 1].every((c) => c === null || c === '')) out.pop();
  return out;
}

// Fill palette for the formatting toolbar
const FILLS = ['#f968b7', '#a78bfa', '#fbbf24', '#60a5fa', '#f87171'];

/** Set/clear one format key on a "row,col" entry, pruning empties. */
function setFmt(fmts, r, c, key, val) {
  const k = `${r},${c}`;
  const cur = { ...(fmts[k] ?? {}) };
  if (val === null || val === false) delete cur[key];
  else cur[key] = val;
  if (Object.keys(cur).length === 0) delete fmts[k];
  else fmts[k] = cur;
}

export default function SneakySpreadsheetsPage() {
  const { theme } = useTheme();
  const hotRef = useRef(null);

  const [tabs, setTabs]         = useState(null);  // null = loading
  const [activeId, setActiveId] = useState(null);
  const [error, setError]       = useState(null);
  const [query, setQuery]       = useState('');

  const active = tabs?.find((t) => t.id === activeId) ?? null;

  // ── Load workbook ───────────────────────────────────────────────────────────
  useEffect(() => {
    api.sheetTabs()
      .then(async ({ tabs: loaded }) => {
        if (loaded.length === 0) {
          // First visit ever — create a starter tab
          const first = await api.sheetCreateTab('Sheet 1');
          loaded = [first];
        }
        setTabs(loaded);
        setActiveId(loaded[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  // ── Debounced whole-tab save — quiet and unhurried (low throughput) ─────────
  const saveTimer = useRef(null);
  const scheduleSave = useCallback((tabId, patch) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const saved = await api.sheetUpdateTab(tabId, patch);
        setTabs((prev) => prev?.map((t) => (t.id === saved.id ? saved : t)));
      } catch (e) {
        setError(e.message);
      }
    }, 3000);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  // ── Per-cell formats — kept in a ref so the renderer sees them live ─────────
  const formatsRef = useRef({});
  useEffect(() => {
    const tab = tabs?.find((t) => t.id === activeId);
    formatsRef.current = { ...(tab?.formats ?? {}) };
    hotRef.current?.hotInstance?.render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const formatRenderer = useCallback(function formatRenderer(instance, td, row, col, prop, value, cellProps) {
    Handsontable.renderers.TextRenderer.apply(this, [instance, td, row, col, prop, value, cellProps]);
    const f = formatsRef.current[`${row},${col}`];
    if (!f) return;
    if (f.b) td.style.fontWeight = '700';
    if (f.i) td.style.fontStyle = 'italic';
    if (f.u) td.style.textDecoration = 'underline';
    // Don't paint over a search hit — the highlight should stay visible
    if (f.fill && !td.classList.contains('htSearchResult')) {
      td.style.backgroundColor = f.fill;
      td.style.color = '#1c1c1e'; // fills are light — keep text readable in dark mode
    }
  }, []);

  // ── Search — built-in plugin highlights matches via .htSearchResult ─────────
  useEffect(() => {
    const hot = hotRef.current?.hotInstance;
    if (!hot) return;
    const plugin = hot.getPlugin('search');
    if (!plugin) return;
    plugin.query(query);
    hot.render();
  }, [query, activeId]);

  /** Shift format coordinates after structural row/col changes. */
  const remapFormats = useCallback((axis, index, amount, removed) => {
    const out = {};
    for (const [k, v] of Object.entries(formatsRef.current)) {
      let [r, c] = k.split(',').map(Number);
      let idx = axis === 'row' ? r : c;
      if (removed) {
        if (idx >= index && idx < index + amount) continue; // dies with its line
        if (idx >= index + amount) idx -= amount;
      } else if (idx >= index) {
        idx += amount;
      }
      if (axis === 'row') r = idx; else c = idx;
      out[`${r},${c}`] = v;
    }
    formatsRef.current = out;
  }, []);

  /** Pull the live grid + current columns/formats and queue a save. */
  const persistGrid = useCallback(() => {
    const hot = hotRef.current?.hotInstance;
    const tab = tabs?.find((t) => t.id === activeId);
    if (!hot || !tab) return;
    scheduleSave(tab.id, { data: trimData(hot.getData()), columns: tab.columns, formats: formatsRef.current });
  }, [tabs, activeId, scheduleSave]);

  // ── Formatting toolbar actions (operate on the current selection) ───────────
  function applyFormat(kind, value = null) {
    const hot = hotRef.current?.hotInstance;
    const tab = tabs?.find((t) => t.id === activeId);
    if (!hot || !tab) return;
    const ranges = hot.getSelectedRange();
    if (!ranges?.length) return;

    const cells = [];
    for (const range of ranges) {
      const tl = range.getTopLeftCorner();
      const br = range.getBottomRightCorner();
      for (let r = Math.max(0, tl.row); r <= br.row; r++) {
        for (let c = Math.max(0, tl.col); c <= br.col; c++) cells.push([r, c]);
      }
    }
    if (!cells.length) return;

    const fmts = { ...formatsRef.current };
    if (kind === 'fill') {
      // Same colour again on an already-filled selection = clear (toggle feel)
      const allSame = cells.every(([r, c]) => fmts[`${r},${c}`]?.fill === value);
      for (const [r, c] of cells) setFmt(fmts, r, c, 'fill', allSame ? null : value);
    } else if (kind === 'clearfill') {
      for (const [r, c] of cells) setFmt(fmts, r, c, 'fill', null);
    } else {
      // b / i / u — Excel-style toggle: on unless every cell already has it
      const allOn = cells.every(([r, c]) => fmts[`${r},${c}`]?.[kind]);
      for (const [r, c] of cells) setFmt(fmts, r, c, kind, !allOn);
    }

    formatsRef.current = fmts;
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, formats: fmts } : t)));
    hot.render();
    scheduleSave(tab.id, { formats: fmts, data: trimData(hot.getData()), columns: tab.columns });
  }

  // ── Column rename — double-tap/double-click a header ────────────────────────
  const headerClickRef = useRef({ t: 0, col: -1 });
  const onCellMouseDown = useCallback((event, coords) => {
    if (coords.row !== -1 || coords.col < 0) return;
    const now = Date.now();
    const last = headerClickRef.current;
    headerClickRef.current = { t: now, col: coords.col };
    if (now - last.t > 400 || last.col !== coords.col) return; // not a double

    const tab = tabs?.find((t) => t.id === activeId);
    if (!tab) return;
    const current = tab.columns[coords.col] ?? '';
    const name = window.prompt('Column name', current);
    if (name === null) return;
    const columns = [...tab.columns];
    columns[coords.col] = name.trim() || current || `Column ${coords.col + 1}`;
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, columns } : t)));
    const hot = hotRef.current?.hotInstance;
    scheduleSave(tab.id, { columns, data: hot ? trimData(hot.getData()) : tab.data });
  }, [tabs, activeId, scheduleSave]);

  // ── Keep column names + formats in step with inserts/removals ───────────────
  const syncCols = useCallback((insertAt, amount, removed = false) => {
    const tab = tabs?.find((t) => t.id === activeId);
    if (!tab) return;
    const columns = [...tab.columns];
    if (removed) columns.splice(insertAt, amount);
    else columns.splice(insertAt, 0, ...Array.from({ length: amount }, (_, k) => `Column ${insertAt + k + 1}`));
    remapFormats('col', insertAt, amount, removed);
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, columns, formats: formatsRef.current } : t)));
    const hot = hotRef.current?.hotInstance;
    scheduleSave(tab.id, { columns, data: hot ? trimData(hot.getData()) : tab.data, formats: formatsRef.current });
  }, [tabs, activeId, scheduleSave, remapFormats]);

  // ── Tab actions ─────────────────────────────────────────────────────────────
  async function addTab() {
    const name = window.prompt('Tab name', `Sheet ${(tabs?.length ?? 0) + 1}`);
    if (name === null) return;
    try {
      const tab = await api.sheetCreateTab(name.trim() || 'Sheet');
      setTabs((prev) => [...(prev ?? []), tab]);
      setActiveId(tab.id);
    } catch (e) { setError(e.message); }
  }

  function renameTab(tab) {
    const name = window.prompt('Tab name', tab.name);
    if (name === null || !name.trim()) return;
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, name: name.trim() } : t)));
    api.sheetUpdateTab(tab.id, { name: name.trim() }).catch((e) => setError(e.message));
  }

  async function deleteTab(tab) {
    if (!confirm(`Delete tab "${tab.name}"? This can't be undone.`)) return;
    try {
      await api.sheetDeleteTab(tab.id);
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== tab.id);
        if (activeId === tab.id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    } catch (e) { setError(e.message); }
  }

  const tabClickRef = useRef({ t: 0, id: null });
  function onTabClick(tab) {
    const now = Date.now();
    const last = tabClickRef.current;
    tabClickRef.current = { t: now, id: tab.id };
    if (tab.id === activeId && last.id === tab.id && now - last.t < 400) {
      renameTab(tab); // double-tap the active tab → rename
      return;
    }
    setActiveId(tab.id);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (error && !tabs) {
    return (
      <div className="space-y-4 py-6">
        <h1 className="text-2xl font-bold text-neutral-900">Sneaky Sheets</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Sneaky Sheets</h1>
          <p className="text-sm text-neutral-500">Double-tap a tab or column header to rename it.</p>
        </div>
      </div>

      {error && tabs && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(tabs ?? []).map((tab) => (
          <span key={tab.id} className="flex shrink-0 items-center">
            <button
              onClick={() => onTabClick(tab)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab.id === activeId
                  ? 'bg-amber-400 text-amber-950'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {tab.name}
            </button>
            {tab.id === activeId && (tabs?.length ?? 0) > 1 && (
              <button
                onClick={() => deleteTab(tab)}
                title="Delete tab"
                className="ml-0.5 rounded px-1 text-neutral-400 hover:text-red-700"
              >
                ×
              </button>
            )}
          </span>
        ))}
        <button
          onClick={addTab}
          title="Add tab"
          className="shrink-0 rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
        >
          +
        </button>
      </div>

      {/* Formatting toolbar — applies to the current cell selection.
          onMouseDown preventDefault keeps the grid selection/focus intact
          while the button is pressed. */}
      <div className="flex items-center gap-1.5" onMouseDown={(e) => e.preventDefault()}>
        <button
          onClick={() => applyFormat('b')}
          title="Bold"
          className="h-8 w-8 rounded-lg bg-neutral-100 text-sm font-bold text-neutral-700 hover:bg-neutral-200"
        >
          B
        </button>
        <button
          onClick={() => applyFormat('i')}
          title="Italic"
          className="h-8 w-8 rounded-lg bg-neutral-100 text-sm italic text-neutral-700 hover:bg-neutral-200"
        >
          I
        </button>
        <button
          onClick={() => applyFormat('u')}
          title="Underline"
          className="h-8 w-8 rounded-lg bg-neutral-100 text-sm text-neutral-700 underline hover:bg-neutral-200"
        >
          U
        </button>
        <span className="mx-1 h-6 w-px bg-neutral-200" />
        {FILLS.map((c) => (
          <button
            key={c}
            onClick={() => applyFormat('fill', c)}
            title="Fill colour"
            className="h-7 w-7 rounded-lg ring-1 ring-black/10 transition hover:scale-110"
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          onClick={() => applyFormat('clearfill')}
          title="Clear fill"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="8" /><line x1="6.5" y1="17.5" x2="17.5" y2="6.5" />
          </svg>
        </button>

        {/* Search — highlights matching cells as you type */}
        <div className="relative ml-auto" onMouseDown={(e) => e.stopPropagation()}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 w-36 rounded-lg border border-neutral-200 bg-white px-3 pr-7 text-sm text-neutral-900 outline-none sm:w-48"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Grid — explicit height: Handsontable's height="100%" needs a parent
          with a definite height, not one derived from flex/min-height.
          isolation:isolate traps Handsontable's internal z-indexes (its sticky
          header overlays use 100+) so they can't paint over the app's
          drawers/menus (z-40). */}
      <div
        className={`overflow-hidden rounded-xl ${theme === 'dark' ? 'ht-theme-main-dark' : 'ht-theme-main'}`}
        style={{ height: 'calc(100dvh - 300px)', minHeight: 420, position: 'relative', zIndex: 0, isolation: 'isolate' }}
      >
        {!tabs && (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">Loading workbook…</div>
        )}
        {active && (
          <HotTable
            key={active.id}
            ref={hotRef}
            data={active.data?.length ? active.data.map((r) => [...r]) : [[null]]}
            colHeaders={active.columns?.length ? active.columns : true}
            rowHeaders={true}
            contextMenu={true}
            search={true}
            outsideClickDeselects={false}
            minRows={16}
            minSpareRows={1}
            manualColumnResize={true}
            manualRowResize={true}
            stretchH="all"
            height="100%"
            width="100%"
            cells={() => ({ renderer: formatRenderer })}
            afterChange={(changes, source) => { if (source !== 'loadData' && changes) persistGrid(); }}
            afterCreateRow={(index, amount) => { remapFormats('row', index, amount, false); persistGrid(); }}
            afterRemoveRow={(index, amount) => { remapFormats('row', index, amount, true); persistGrid(); }}
            afterCreateCol={(index, amount) => syncCols(index, amount, false)}
            afterRemoveCol={(index, amount) => syncCols(index, amount, true)}
            afterOnCellMouseDown={onCellMouseDown}
            licenseKey="non-commercial-and-evaluation"
          />
        )}
      </div>
    </div>
  );
}
