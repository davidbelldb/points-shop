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

export default function SneakySpreadsheetsPage() {
  const { theme } = useTheme();
  const hotRef = useRef(null);

  const [tabs, setTabs]         = useState(null);  // null = loading
  const [activeId, setActiveId] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [savedAt, setSavedAt]   = useState(null);
  const [error, setError]       = useState(null);

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

  // ── Debounced whole-tab save ────────────────────────────────────────────────
  const saveTimer = useRef(null);
  const scheduleSave = useCallback((tabId, patch) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const saved = await api.sheetUpdateTab(tabId, patch);
        setTabs((prev) => prev?.map((t) => (t.id === saved.id ? saved : t)));
        setSavedAt(new Date());
      } catch (e) {
        setError(e.message);
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  /** Pull the live grid + current columns and queue a save. */
  const persistGrid = useCallback(() => {
    const hot = hotRef.current?.hotInstance;
    const tab = tabs?.find((t) => t.id === activeId);
    if (!hot || !tab) return;
    scheduleSave(tab.id, { data: trimData(hot.getData()), columns: tab.columns });
  }, [tabs, activeId, scheduleSave]);

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

  // ── Keep column names in step with inserts/removals via context menu ────────
  const syncCols = useCallback((insertAt, amount, removed = false) => {
    const tab = tabs?.find((t) => t.id === activeId);
    if (!tab) return;
    const columns = [...tab.columns];
    if (removed) columns.splice(insertAt, amount);
    else columns.splice(insertAt, 0, ...Array.from({ length: amount }, (_, k) => `Column ${insertAt + k + 1}`));
    setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, columns } : t)));
    const hot = hotRef.current?.hotInstance;
    scheduleSave(tab.id, { columns, data: hot ? trimData(hot.getData()) : tab.data });
  }, [tabs, activeId, scheduleSave]);

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
        <h1 className="text-2xl font-bold text-neutral-900">Sneaky Spreadsheets</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Sneaky Spreadsheets</h1>
          <p className="text-sm text-neutral-500">Tabs upon tabs. Double-tap a tab or column header to rename it.</p>
        </div>
        <span className="text-[11px] text-neutral-400">
          {saving ? 'Saving…' : savedAt ? 'Saved' : ''}
        </span>
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

      {/* Grid — explicit height: Handsontable's height="100%" needs a parent
          with a definite height, not one derived from flex/min-height */}
      <div
        className={`overflow-hidden rounded-xl ${theme === 'dark' ? 'ht-theme-main-dark' : 'ht-theme-main'}`}
        style={{ height: 'calc(100dvh - 300px)', minHeight: 420 }}
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
            minSpareRows={1}
            manualColumnResize={true}
            manualRowResize={true}
            stretchH="all"
            height="100%"
            width="100%"
            afterChange={(changes, source) => { if (source !== 'loadData' && changes) persistGrid(); }}
            afterCreateRow={() => persistGrid()}
            afterRemoveRow={() => persistGrid()}
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
