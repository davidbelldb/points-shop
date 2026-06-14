import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * SneakyscapesPage
 * ----------------
 * Foundational map grid + mobile touch drag-and-drop engine + 2.5D occlusion
 * masking for Katie's garden planner ("Sneakyscapes").
 *
 * Data model (for future PostgreSQL JSONB):
 *  - Flat key/value map gridMap['Z01-A01'] = { key, zone, row, rowIndex, col,
 *    label, blocked }. Every zone is an identical A–W (23) x 1–13 (13) matrix =
 *    299 tiles/zone, 1196 total. House footprint stays as present-but-blocked
 *    tiles so offset maths is uniform.
 *
 * View model:
 *  - FRONT view  = Zone 0 alone (23 rows).
 *  - BACK view   = Zones 3, 2, 1 stacked into ONE continuous grid (69 rows,
 *    back-of-property at top). Each tile keeps its own zone identity for later
 *    notifications ("Hydrangea needs water — Zone 1, B07"), but visually the
 *    three back zones read as a single lawn. Items may span a zone seam.
 *
 * Rendering:
 *  - One CSS grid per board. Column 1 = row-letter gutter, row 1 = number
 *    header, the matrix lives in cols 2..14 / rows 2.. . EVERYTHING (cells,
 *    placed items, preview, dividers) is positioned by EXPLICIT grid line, so a
 *    drop never reflows or grows the grid — overlays stack on top of fixed cells.
 *  - Board colours are fixed hex (a self-contained "game canvas", Stardew-style)
 *    so they're immune to the app's palette remap / neutral-scale inversion.
 *    Chrome (header, tray, panel, modal) uses the app's semantic neutral + amber
 *    tokens so it themes correctly in light AND dark mode.
 *
 * 2.5D occlusion: tall structures carry a "clearance" buffer of N rows ABOVE
 * (behind) their base — the Visual Shadow Footprint. Those tiles are marked
 * occupied so nothing clips through the back wall / roof.
 *
 * Touch DnD: unified pointer events, no HTML5 DnD. Page scroll is locked while
 * dragging. Long-press a placed item to remove (refund) or duplicate it.
 */

/* ------------------------------------------------------------------ */
/* Static grid configuration                                          */
/* ------------------------------------------------------------------ */

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVW'.split(''); // 23 rows, index 0..22
const COLS = Array.from({ length: 13 }, (_, i) => i + 1); // 1..13
const ZONES = [0, 1, 2, 3];
// Coordinate labels, gutter and zone dividers are intentionally NOT rendered for
// now (the coordinates still exist in the data model). Cells fill the grid edge
// to edge: column = col (1..13), row = global row + 1.
const GRID_COLS_TEMPLATE = 'repeat(13, minmax(0, 1fr))';

// View stacks (top -> bottom). Back-of-property (Zone 3) sits at the top.
const FRONT_STACK = [0];
const BACK_STACK = [3, 2, 1];
const stackForZone = (zone) => (zone === 0 ? FRONT_STACK : BACK_STACK);

// Placeholder — the player will name their plot during game setup later.
const SNEAKYSCAPE_NAME = "Katie's Sneakyscape";
// Tabbed journal pages — Stardew-style. Add more pages here as the game grows.
const PANEL_TABS = [
  { key: 'status', label: 'Status' },
  { key: 'items', label: 'Items' },
];

// Fixed board palette (theme-independent game canvas).
const CELL_A = '#356b3b';
const CELL_B = '#2f5d34';
const HOUSE = '#5b6470';
const HOUSE_HATCH =
  'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 3px, transparent 3px 6px)';
const SHADOW_FILL = 'rgba(15,23,42,0.42)';
const SHADOW_HATCH =
  'repeating-linear-gradient(45deg, rgba(0,0,0,0.30) 0 4px, transparent 4px 8px)';
const CELL_LINE = '1px solid rgba(0,0,0,0.22)';

// Fixed game-UI palette (theme-independent HUD / modal — reads as a game overlay
// in both light and dark app themes; to be reskinned with textures later).
const UI = {
  frame: '#1b241c', // canvas backdrop around/behind the grid
  panel: '#28332b', // modal panel
  raised: '#33403a', // sub-panels inside the modal
  text: '#f1ede1', // parchment text
  muted: '#a6b0a3', // muted text
  accent: '#e0b35a', // gold accent
  accentInk: '#26200f', // text on accent
  border: 'rgba(0,0,0,0.45)',
  hud: 'rgba(20,28,20,0.74)', // floating HUD button bg
};

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (zone, rowIndex, col) => `Z${pad2(zone)}-${ROWS[rowIndex]}${pad2(col)}`;
const labelOf = (zone, rowIndex, col) =>
  `Zone ${zone} - Grid ${ROWS[rowIndex]}${pad2(col)}`;

/** Non-playable (house footprint) tile keys. Ranges inclusive [colStart,colEnd]. */
function buildBlockedSet() {
  const blocked = new Set();
  const addRange = (zone, rowLetter, colStart, colEnd) => {
    const rowIndex = ROWS.indexOf(rowLetter);
    for (let c = colStart; c <= colEnd; c++) blocked.add(keyOf(zone, rowIndex, c));
  };

  // Zone 0: ONLY rows N..W, cols 8..13 are AVAILABLE; the rest is house.
  const z0AvailRows = ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'];
  ROWS.forEach((rowLetter, rowIndex) => {
    COLS.forEach((col) => {
      const available = z0AvailRows.includes(rowLetter) && col >= 8 && col <= 13;
      if (!available) blocked.add(keyOf(0, rowIndex, col));
    });
  });

  // Zone 1: house footprint.
  addRange(1, 'K', 4, 6);
  addRange(1, 'L', 4, 6);
  addRange(1, 'M', 4, 6); // M07 playable
  addRange(1, 'N', 4, 10);
  addRange(1, 'O', 4, 10);
  addRange(1, 'P', 4, 10); // P06 now house
  addRange(1, 'Q', 4, 10);
  addRange(1, 'R', 1, 10);
  ['S', 'T', 'U', 'V', 'W'].forEach((r) => addRange(1, r, 1, 10));

  // Zones 2 & 3 fully playable.
  return blocked;
}

function buildGridMap() {
  const blocked = buildBlockedSet();
  const map = {};
  ZONES.forEach((zone) => {
    ROWS.forEach((rowLetter, rowIndex) => {
      COLS.forEach((col) => {
        const key = keyOf(zone, rowIndex, col);
        map[key] = {
          key,
          zone,
          row: rowLetter,
          rowIndex,
          col,
          label: labelOf(zone, rowIndex, col),
          blocked: blocked.has(key),
        };
      });
    });
  });
  return map;
}

/* ------------------------------------------------------------------ */
/* Item catalog                                                       */
/* w = width (cols), h = base depth (rows), clearance = shadow rows.   */
/* size in real-world ft is for reference as art is added.            */
/* ------------------------------------------------------------------ */

const CATALOG = [
  { key: 'grass', name: 'Grass', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, color: '#43a047' },
  { key: 'soil', name: 'Soil', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, color: '#7c4a1e' },
  { key: 'gravel', name: 'Gravel', type: 'terrain', w: 1, h: 1, clearance: 0, price: 8, available: 999, color: '#9aa0a6' },
  { key: 'hydrangea', name: 'Hydrangea', type: 'entity', w: 1, h: 1, clearance: 0, price: 40, available: 12, color: '#3d9be0' },
  { key: 'bench', name: 'Garden Bench', type: 'entity', w: 2, h: 1, clearance: 0, price: 120, available: 4, color: '#9c6b27' },
  { key: 'shed', name: 'Garden Office / Shed', type: 'entity', w: 5, h: 4, clearance: 2, price: 1500, available: 1, color: '#6b7280' },
  { key: 'trampoline', name: 'Trampoline', type: 'entity', w: 5, h: 5, clearance: 0, price: 600, available: 1, color: '#5b54d6' },
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((i) => [i.key, i]));

/**
 * Resolve an item's footprint within a given view stack.
 * Returns one entry per occupied tile: { inBounds, key }.
 * Base extends DOWN (global rows +), the shadow buffer extends UP (global -).
 */
function resolveFootprint(stack, zone, rowIndex, col, item) {
  const totalRows = stack.length * 23;
  const gAnchor = stack.indexOf(zone) * 23 + rowIndex;
  const cells = [];
  for (let dr = 0; dr < item.h; dr++) {
    for (let dc = 0; dc < item.w; dc++) cells.push([gAnchor + dr, col + dc]);
  }
  for (let dr = 1; dr <= item.clearance; dr++) {
    for (let dc = 0; dc < item.w; dc++) cells.push([gAnchor - dr, col + dc]);
  }
  return cells.map(([g, c]) => {
    const inBounds = g >= 0 && g < totalRows && c >= 1 && c <= 13;
    if (!inBounds) return { inBounds: false, key: null };
    const z = stack[Math.floor(g / 23)];
    const ri = g % 23;
    return { inBounds: true, key: keyOf(z, ri, c) };
  });
}

let INSTANCE_SEQ = 1;

// --- Local persistence -------------------------------------------------------
// Placements survive a browser refresh by round-tripping through localStorage.
// The stored shape (array of { id, itemKey, zone, rowIndex, col, anchorKey }) is
// already JSONB-friendly, so this same payload can be POSTed to the backend and
// stored per-user in Postgres later with no restructuring.
const STORAGE_KEY = 'sneakyscapes:placed:v1';

function loadPlaced() {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // Keep only well-formed rows that reference a known item.
    const clean = data.filter(
      (p) =>
        p && CATALOG_BY_KEY[p.itemKey] &&
        Number.isInteger(p.rowIndex) && Number.isInteger(p.col) && [0, 1, 2, 3].includes(p.zone)
    );
    // Advance the id sequence past anything we just restored to avoid collisions.
    const maxId = clean.reduce((m, p) => Math.max(m, p.id || 0), 0);
    if (maxId >= INSTANCE_SEQ) INSTANCE_SEQ = maxId + 1;
    return clean;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SneakyscapesPage() {
  const gridMap = useMemo(() => buildGridMap(), []);

  const [placed, setPlaced] = useState(loadPlaced); // {id, itemKey, zone, rowIndex, col, anchorKey}
  const [dragItem, setDragItem] = useState(null);
  const [ghost, setGhost] = useState(null); // {x,y}
  const [preview, setPreview] = useState(null); // {zone, rowIndex, col, valid}
  const [side, setSide] = useState('back'); // 'front' | 'back'
  const [movingId, setMovingId] = useState(null);
  const [menu, setMenu] = useState(null); // {id, x, y} long-press popout
  const [dupCount, setDupCount] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false); // Stardew journal panel
  const [panelTab, setPanelTab] = useState('status');
  const [now, setNow] = useState(() => new Date());
  const swipeX = useRef(null);

  const lastPt = useRef(null);
  const rafId = useRef(null);
  const dragRef = useRef(null);
  const movingRef = useRef(null);

  // Occupied tiles (base + shadow). The item being moved is excluded.
  const occupied = useMemo(() => {
    const set = new Set();
    placed.forEach((p) => {
      if (p.id === movingId) return;
      const item = CATALOG_BY_KEY[p.itemKey];
      resolveFootprint(stackForZone(p.zone), p.zone, p.rowIndex, p.col, item).forEach((x) => {
        if (x.inBounds) set.add(x.key);
      });
    });
    return set;
  }, [placed, movingId]);
  const occupiedRef = useRef(occupied);
  occupiedRef.current = occupied;

  // Persist placements so they survive a browser refresh.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placed));
    } catch {
      /* storage unavailable (private mode / quota) — keep going in-memory */
    }
  }, [placed]);

  // live clock for the Status tab (time of day)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // swipe between journal tabs
  const onPanelDown = (e) => { swipeX.current = e.clientX; };
  const onPanelUp = (e) => {
    if (swipeX.current == null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (Math.abs(dx) < 50) return;
    const i = PANEL_TABS.findIndex((t) => t.key === panelTab);
    const ni = Math.min(PANEL_TABS.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1)));
    setPanelTab(PANEL_TABS[ni].key);
  };

  // Pick an item out of the journal's Items tab and immediately start dragging
  // it onto the grid. Closing the panel reveals the cells under the finger so
  // elementFromPoint can hit-test them mid-drag.
  const startDragFromPanel = (item) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPanelOpen(false);
    movingRef.current = null;
    setMovingId(null);
    dragRef.current = item;
    setDragItem(item);
    setGhost({ x: e.clientX, y: e.clientY });
    lastPt.current = { x: e.clientX, y: e.clientY };
  };

  /* ---------------- pointer drag engine ---------------- */

  const computePreviewAt = (clientX, clientY) => {
    const item = dragRef.current;
    if (!item) return null;
    const el = document.elementFromPoint(clientX, clientY);
    const cellEl = el && el.closest('[data-cell]');
    if (!cellEl) return null;
    const zone = Number(cellEl.dataset.zone);
    const rowIndex = Number(cellEl.dataset.row);
    const col = Number(cellEl.dataset.col);
    const cells = resolveFootprint(stackForZone(zone), zone, rowIndex, col, item);
    const valid = cells.every(
      (x) => x.inBounds && !gridMap[x.key].blocked && !occupiedRef.current.has(x.key)
    );
    return { zone, rowIndex, col, valid };
  };

  useEffect(() => {
    if (!dragItem) return undefined;

    const flush = () => {
      rafId.current = null;
      const pt = lastPt.current;
      if (!pt) return;
      setGhost(pt);
      setPreview(computePreviewAt(pt.x, pt.y));
    };

    const onMove = (e) => {
      e.preventDefault(); // lock the map mid-drag
      lastPt.current = { x: e.clientX, y: e.clientY };
      if (rafId.current == null) rafId.current = requestAnimationFrame(flush);
    };

    const finish = (e) => {
      const result = computePreviewAt(e.clientX, e.clientY);
      const mId = movingRef.current;
      if (result && result.valid) {
        const item = dragRef.current;
        const anchorKey = keyOf(result.zone, result.rowIndex, result.col);
        if (mId != null) {
          setPlaced((prev) =>
            prev.map((p) =>
              p.id === mId
                ? { ...p, zone: result.zone, rowIndex: result.rowIndex, col: result.col, anchorKey }
                : p
            )
          );
        } else {
          setPlaced((prev) => [
            ...prev,
            { id: INSTANCE_SEQ++, itemKey: item.key, zone: result.zone, rowIndex: result.rowIndex, col: result.col, anchorKey },
          ]);
        }
      }
      cleanup();
    };

    const cleanup = () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastPt.current = null;
      dragRef.current = null;
      movingRef.current = null;
      setMovingId(null);
      setDragItem(null);
      setGhost(null);
      setPreview(null);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cleanup);
    return () => {
      window.removeEventListener('pointermove', onMove, { passive: false });
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cleanup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragItem]);

  const beginMove = (p, x, y) => {
    const item = CATALOG_BY_KEY[p.itemKey];
    movingRef.current = p.id;
    setMovingId(p.id);
    dragRef.current = item;
    setDragItem(item);
    setGhost({ x, y });
    lastPt.current = { x, y };
  };

  // Press-and-hold gesture on a placed item: move (on drag) OR open menu (on hold).
  const onItemPointerDown = (p) => (e) => {
    if (dragRef.current || menu) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        teardown();
        beginMove(p, ev.clientX, ev.clientY);
      }
    };
    const up = () => teardown();
    const timer = setTimeout(() => {
      teardown();
      setDupCount(1);
      setMenu({ id: p.id, x: startX, y: startY });
    }, 420);
    const teardown = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const removePlaced = (id) => setPlaced((prev) => prev.filter((p) => p.id !== id));

  // Duplicate: scan the item's view stack for N free, valid anchor positions.
  const duplicateItem = (srcId, n) => {
    const src = placed.find((p) => p.id === srcId);
    if (!src) return;
    const item = CATALOG_BY_KEY[src.itemKey];
    const stack = stackForZone(src.zone);
    const totalRows = stack.length * 23;
    const occ = new Set(occupied);
    const copies = [];
    const startG = stack.indexOf(src.zone) * 23 + src.rowIndex;
    for (let g = startG; g < totalRows && copies.length < n; g++) {
      for (let c = 1; c <= 13 && copies.length < n; c++) {
        if (g === startG && c <= src.col) continue; // skip original + left of it on its row
        const z = stack[Math.floor(g / 23)];
        const ri = g % 23;
        const cells = resolveFootprint(stack, z, ri, c, item);
        const ok = cells.every((x) => x.inBounds && !gridMap[x.key].blocked && !occ.has(x.key));
        if (ok) {
          cells.forEach((x) => occ.add(x.key));
          copies.push({ id: INSTANCE_SEQ++, itemKey: item.key, zone: z, rowIndex: ri, col: c, anchorKey: keyOf(z, ri, c) });
        }
      }
    }
    if (copies.length) setPlaced((prev) => [...prev, ...copies]);
  };

  /* ---------------- static board (cells/gutter/dividers) ---------------- */

  const boards = useMemo(() => {
    const make = (stack) => {
      const els = [];
      stack.forEach((zone, si) => {
        ROWS.forEach((rowLetter, ri) => {
          const g = si * 23 + ri;
          COLS.forEach((col) => {
            const cell = gridMap[keyOf(zone, ri, col)];
            const checker = (ri + col) % 2 === 0;
            const style = {
              gridColumn: col,
              gridRow: g + 1,
              border: CELL_LINE,
              backgroundColor: cell.blocked ? HOUSE : checker ? CELL_A : CELL_B,
            };
            if (cell.blocked) style.backgroundImage = HOUSE_HATCH;
            els.push(
              <div key={cell.key} data-cell data-zone={zone} data-row={ri} data-col={col}
                data-blocked={cell.blocked ? 'true' : 'false'} title={cell.label}
                style={style} className="aspect-square" />
            );
          });
        });
      });
      return els;
    };
    return { front: make(FRONT_STACK), back: make(BACK_STACK) };
  }, [gridMap]);

  /* ---------------- dynamic overlays ---------------- */

  const renderPlacedOverlays = (stack) =>
    placed
      .filter((p) => stack.includes(p.zone) && p.id !== movingId)
      .flatMap((p) => {
        const item = CATALOG_BY_KEY[p.itemKey];
        const gTop = stack.indexOf(p.zone) * 23 + p.rowIndex;
        const nodes = [];
        if (item.clearance > 0) {
          const rawTop = gTop - item.clearance + 1;
          const top = Math.max(1, rawTop);
          const span = gTop + 1 - top;
          if (span > 0) {
            nodes.push(
              <div key={`${p.id}-buf`}
                style={{ gridColumn: `${p.col} / span ${item.w}`, gridRow: `${top} / span ${span}`, backgroundColor: SHADOW_FILL, backgroundImage: SHADOW_HATCH }}
                className="pointer-events-none z-10 border border-dashed border-black/40" />
            );
          }
        }
        nodes.push(
          <div key={p.id} onPointerDown={onItemPointerDown(p)}
            style={{
              gridColumn: `${p.col} / span ${item.w}`,
              gridRow: `${gTop + 1} / span ${item.h}`,
              backgroundColor: item.color,
              pointerEvents: dragItem ? 'none' : 'auto',
              touchAction: 'none',
            }}
            className="z-20 flex cursor-grab touch-none items-center justify-center text-[7px] font-semibold leading-tight text-white shadow ring-1 ring-black/40 active:cursor-grabbing">
            <span className="px-0.5 text-center drop-shadow">{item.name}</span>
          </div>
        );
        return nodes;
      });

  const renderPreviewOverlay = (stack) => {
    if (!preview || !dragItem || !stack.includes(preview.zone)) return null;
    const gTop = stack.indexOf(preview.zone) * 23 + preview.rowIndex;
    const rawTop = gTop - dragItem.clearance + 1;
    const top = Math.max(1, rawTop);
    const span = gTop + dragItem.h + 1 - top;
    if (span <= 0) return null;
    return (
      <div className="pointer-events-none z-30"
        style={{
          gridColumn: `${preview.col} / span ${dragItem.w}`,
          gridRow: `${top} / span ${span}`,
          backgroundColor: preview.valid ? 'rgba(34,197,94,0.40)' : 'rgba(239,68,68,0.42)',
          boxShadow: preview.valid ? 'inset 0 0 0 2px #16a34a' : 'inset 0 0 0 2px #dc2626',
        }} />
    );
  };

  const renderBoard = (stack, cells) => (
    <div className="relative grid w-full select-none"
      style={{ gridTemplateColumns: GRID_COLS_TEMPLATE }}>
      {cells}
      {renderPlacedOverlays(stack)}
      {renderPreviewOverlay(stack)}
    </div>
  );

  /* ---------------- layout ---------------- */

  const menuItem = menu ? placed.find((p) => p.id === menu.id) : null;
  const menuCat = menuItem ? CATALOG_BY_KEY[menuItem.itemKey] : null;
  const areaName = side === 'front' ? 'Front Garden' : 'Back Garden';

  // Status-tab clock
  const hour = now.getHours();
  const phase = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const actions = []; // future: [{ id, text, due }] e.g. "Water Hydrangea today between …"

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden" style={{ backgroundColor: UI.frame }}>
      {/* full-screen game canvas */}
      <div className="h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ touchAction: dragItem ? 'none' : 'pan-y' }}>
        {side === 'front' ? renderBoard(FRONT_STACK, boards.front) : renderBoard(BACK_STACK, boards.back)}
      </div>

      {/* floating HUD menu button (over the grid) */}
      <button onClick={() => { setPanelTab('status'); setPanelOpen(true); }} aria-label="Open menu"
        className="absolute left-3 top-3 z-40 flex h-11 w-11 items-center justify-center rounded-xl active:scale-95"
        style={{ backgroundColor: UI.hud, border: `1px solid ${UI.border}`, color: UI.text, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      {/* floating drag chip */}
      {ghost && dragItem && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[10px] font-semibold shadow-lg"
          style={{ left: ghost.x, top: ghost.y, backgroundColor: UI.accent, color: UI.accentInk }}>
          {dragItem.name}
        </div>
      )}

      {/* long-press popout modal */}
      {menu && menuItem && menuCat && (
        <>
          <div className="fixed inset-0 z-50" onPointerDown={() => setMenu(null)} />
          <div className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-xl p-3 shadow-2xl"
            style={{ left: Math.min(Math.max(menu.x, 110), window.innerWidth - 110), top: Math.max(menu.y - 12, 140), width: 200, backgroundColor: UI.panel, border: `1px solid ${UI.border}`, color: UI.text }}
            onPointerDown={(e) => e.stopPropagation()}>
            <div className="mb-2">
              <p className="text-[12px] font-bold">{menuCat.name}</p>
              <p className="text-[10px]" style={{ color: UI.muted }}>{menuItem.anchorKey} · {menuCat.price} pts each</p>
            </div>

            <div className="mb-2 flex items-center justify-between rounded-lg p-1" style={{ backgroundColor: UI.raised }}>
              <button onClick={() => setDupCount((n) => Math.max(1, n - 1))}
                className="h-7 w-7 rounded-md text-base font-bold" style={{ backgroundColor: UI.panel, color: UI.text }}>−</button>
              <span className="text-sm font-semibold">{dupCount}×</span>
              <button onClick={() => setDupCount((n) => Math.min(20, n + 1))}
                className="h-7 w-7 rounded-md text-base font-bold" style={{ backgroundColor: UI.panel, color: UI.text }}>+</button>
            </div>

            <button onClick={() => { duplicateItem(menu.id, dupCount); setMenu(null); }}
              className="mb-2 w-full rounded-lg py-2 text-[12px] font-semibold" style={{ backgroundColor: UI.accent, color: UI.accentInk }}>
              Duplicate ×{dupCount} (−{dupCount * menuCat.price} pts)
            </button>
            <button onClick={() => { removePlaced(menu.id); setMenu(null); }}
              className="w-full rounded-lg py-2 text-[12px] font-semibold text-white" style={{ backgroundColor: '#b3402f' }}>
              Remove (refund {menuCat.price} pts)
            </button>
          </div>
        </>
      )}

      {/* central game menu modal */}
      {panelOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onPointerDown={() => setPanelOpen(false)} />
          <div className="relative z-10 flex max-h-[86vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{ backgroundColor: UI.panel, border: `1px solid ${UI.border}`, color: UI.text }}>
            {/* header: area name + close */}
            <div className="flex items-start justify-between px-4 pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Now tending</p>
                <p className="text-xl font-extrabold">{areaName}</p>
              </div>
              <button onClick={() => setPanelOpen(false)} aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg" style={{ backgroundColor: UI.raised, color: UI.text }}>✕</button>
            </div>

            {/* front / back switcher */}
            <div className="px-4 pt-3">
              <div className="flex rounded-full p-0.5 text-sm" style={{ backgroundColor: UI.raised }}>
                {['front', 'back'].map((s) => (
                  <button key={s} onClick={() => setSide(s)}
                    className="flex-1 rounded-full px-3 py-1.5 font-semibold capitalize"
                    style={side === s
                      ? { backgroundColor: UI.accent, color: UI.accentInk }
                      : { color: UI.muted }}>
                    {s} garden
                  </button>
                ))}
              </div>
            </div>

            {/* tab bar */}
            <div className="mt-3 flex px-2" style={{ borderBottom: `1px solid ${UI.border}` }}>
              {PANEL_TABS.map((t) => (
                <button key={t.key} onClick={() => setPanelTab(t.key)}
                  className="flex-1 py-2 text-sm font-semibold"
                  style={panelTab === t.key
                    ? { color: UI.accent, borderBottom: `2px solid ${UI.accent}` }
                    : { color: UI.muted }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* swipeable content */}
            <div className="flex-1 overflow-y-auto p-4" style={{ touchAction: 'pan-y' }}
              onPointerDown={onPanelDown} onPointerUp={onPanelUp}>
              {panelTab === 'status' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Sneakyscape</p>
                    <p className="text-lg font-extrabold">{SNEAKYSCAPE_NAME}</p>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: UI.raised }}>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Time of day</p>
                    <p className="text-2xl font-bold">{timeStr}</p>
                    <p className="text-sm" style={{ color: UI.accent }}>{phase} · {dateStr}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Outstanding actions</p>
                    {actions.length === 0 ? (
                      <p className="rounded-xl p-3 text-sm" style={{ border: `1px dashed ${UI.border}`, color: UI.muted }}>
                        Nothing needs attention right now. Plants you place will list watering &amp; frost-cover reminders here, with their location.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {actions.map((a) => (
                          <li key={a.id} className="rounded-xl p-3 text-sm" style={{ backgroundColor: UI.raised }}>{a.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <ul className="space-y-2">
                    {CATALOG.map((item) => (
                      <li key={item.key}>
                        <button onPointerDown={startDragFromPanel(item)} style={{ touchAction: 'none', backgroundColor: UI.raised, border: `1px solid ${UI.border}` }}
                          className="flex w-full select-none items-center justify-between rounded-xl p-2 text-left active:scale-[0.98]">
                          <span className="flex items-center gap-3">
                            <span className="h-9 w-9 shrink-0 rounded" style={{ backgroundColor: item.color }} />
                            <span>
                              <span className="block text-sm font-semibold">{item.name}</span>
                              <span className="block text-[10px]" style={{ color: UI.muted }}>
                                {item.w}×{item.h}{item.clearance ? ` (+${item.clearance} shadow)` : ''} ·{' '}
                                {item.available > 99 ? '∞' : item.available} available
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-bold" style={{ color: UI.accent }}>
                            {item.price} pt{item.price === 1 ? '' : 's'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-center text-[10px]" style={{ color: UI.muted }}>Drag an item onto the grid to place it.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
