import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * SneakyscapesPage
 * ----------------
 * Foundational map grid + mobile touch drag-and-drop engine + 2.5D occlusion
 * masking for Katie's garden planner ("Sneakyscapes").
 *
 * Design notes for future PostgreSQL integration:
 *  - The whole play space is generated into a FLAT key/value map:
 *        gridMap['Z01-A01'] = { key, zone, row, rowIndex, col, label, blocked }
 *    Every zone is mapped to an identical A–W (23) x 1–13 (13) matrix = 299
 *    tiles/zone, 1196 tiles total. The house footprint is kept as
 *    structurally-present-but-blocked tiles so coordinate/offset maths is
 *    uniform across the front and back gardens. This object pipes cleanly into
 *    a JSONB column later.
 *  - Placement is anchored to an item's TOP-LEFT corner cell.
 *  - Tall structures carry a 2-row "clearance" buffer ABOVE (behind) their base
 *    footprint to fake Stardew-style vertical occlusion; those buffer tiles are
 *    marked occupied so nothing can clip into the back wall/roof.
 *
 * Built for portrait mobile (iOS Safari) — no HTML5 DnD, unified pointer events.
 */

/* ------------------------------------------------------------------ */
/* Static grid configuration                                          */
/* ------------------------------------------------------------------ */

const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVW'.split(''); // 23 rows, index 0..22
const COLS = Array.from({ length: 13 }, (_, i) => i + 1); // 1..13
const ZONES = [0, 1, 2, 3];
const COLS_TEMPLATE = 'repeat(13, minmax(0, 1fr))';

const ZONE_TITLES = {
  0: 'Zone 0 — Front Garden',
  1: 'Zone 1 — Back Garden (lower)',
  2: 'Zone 2 — Back Garden (mid)',
  3: 'Zone 3 — Back Garden (top)',
};

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (zone, rowIndex, col) => `Z${pad2(zone)}-${ROWS[rowIndex]}${pad2(col)}`;
const labelOf = (zone, rowIndex, col) =>
  `Zone ${zone} - Grid ${ROWS[rowIndex]}${pad2(col)}`;

/**
 * Build the set of strictly non-playable (house footprint) tile keys.
 * Ranges are inclusive [colStart, colEnd] per row letter.
 */
function buildBlockedSet() {
  const blocked = new Set();
  const addRange = (zone, rowLetter, colStart, colEnd) => {
    const rowIndex = ROWS.indexOf(rowLetter);
    for (let c = colStart; c <= colEnd; c++) blocked.add(keyOf(zone, rowIndex, c));
  };

  // --- Zone 0: ONLY rows N..W, cols 8..13 are AVAILABLE. Everything else is house. ---
  const z0AvailRows = ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'];
  ROWS.forEach((rowLetter, rowIndex) => {
    COLS.forEach((col) => {
      const available = z0AvailRows.includes(rowLetter) && col >= 8 && col <= 13;
      if (!available) blocked.add(keyOf(0, rowIndex, col));
    });
  });

  // --- Zone 1: house clips into the lower section. Explicit out-of-bounds blocks. ---
  addRange(1, 'K', 4, 6);
  addRange(1, 'L', 4, 6);
  addRange(1, 'M', 4, 6); // M07 is playable
  addRange(1, 'N', 4, 10);
  addRange(1, 'O', 4, 10);
  addRange(1, 'P', 4, 5);
  addRange(1, 'P', 7, 10); // P06 stays playable
  addRange(1, 'Q', 4, 4);
  addRange(1, 'Q', 7, 10); // Q05, Q06 stay playable
  addRange(1, 'R', 1, 6);
  // S..W full-width block (cols 1..10) — pattern repeats identically.
  ['S', 'T', 'U', 'V', 'W'].forEach((r) => addRange(1, r, 1, 10));

  // Zones 2 & 3 are fully playable.
  return blocked;
}

/**
 * Build the flat grid map. Keyed by canonical id e.g. "Z01-A01".
 */
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
/* Test object catalog                                                */
/* w = width in tiles (columns), h = depth in tiles (rows),           */
/* clearance = extra rows of occlusion buffer ABOVE the base.         */
/* ------------------------------------------------------------------ */

const CATALOG = [
  { key: 'grass', name: 'Grass', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, cls: 'bg-green-400 dark:bg-green-600' },
  { key: 'soil', name: 'Soil', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, cls: 'bg-amber-700 dark:bg-amber-800' },
  { key: 'gravel', name: 'Gravel', type: 'terrain', w: 1, h: 1, clearance: 0, price: 8, available: 999, cls: 'bg-stone-400 dark:bg-stone-500' },
  { key: 'hydrangea', name: 'Hydrangea', type: 'entity', w: 1, h: 1, clearance: 0, price: 40, available: 12, cls: 'bg-sky-400 dark:bg-sky-600' },
  { key: 'bench', name: 'Garden Bench', type: 'entity', w: 2, h: 1, clearance: 0, price: 120, available: 4, cls: 'bg-yellow-700 dark:bg-yellow-800' },
  { key: 'shed', name: 'Garden Office / Shed', type: 'entity', w: 5, h: 4, clearance: 2, price: 1500, available: 1, cls: 'bg-slate-500 dark:bg-slate-600' },
  { key: 'trampoline', name: 'Trampoline', type: 'entity', w: 5, h: 5, clearance: 0, price: 600, available: 1, cls: 'bg-indigo-500 dark:bg-indigo-600' },
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((i) => [i.key, i]));

/**
 * Given a top-left anchor cell, return base + occlusion-buffer tile coords.
 * Each coord is [zone, rowIndex, col]. Buffer rows extend ABOVE (behind).
 */
function footprint(zone, rowIndex, col, item) {
  const base = [];
  const buffer = [];
  for (let dr = 0; dr < item.h; dr++) {
    for (let dc = 0; dc < item.w; dc++) base.push([zone, rowIndex + dr, col + dc]);
  }
  for (let dr = 1; dr <= item.clearance; dr++) {
    for (let dc = 0; dc < item.w; dc++) buffer.push([zone, rowIndex - dr, col + dc]);
  }
  return { base, buffer };
}

function cellIsFree(gridMap, occupied, zone, rowIndex, col) {
  if (rowIndex < 0 || rowIndex > 22 || col < 1 || col > 13) return false; // off-grid / cross-zone
  const cell = gridMap[keyOf(zone, rowIndex, col)];
  if (!cell || cell.blocked) return false;
  if (occupied.has(keyOf(zone, rowIndex, col))) return false;
  return true;
}

let INSTANCE_SEQ = 1;

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SneakyscapesPage() {
  // The flat grid model — stable for the lifetime of the page.
  const gridMap = useMemo(() => buildGridMap(), []);

  const [placed, setPlaced] = useState([]); // {id, itemKey, zone, rowIndex, col, anchorKey}
  const [dragItem, setDragItem] = useState(null); // active CATALOG item while dragging
  const [ghost, setGhost] = useState(null); // {x,y} pointer position for the floating chip
  const [preview, setPreview] = useState(null); // {zone, rowIndex, col, valid}
  const [side, setSide] = useState('back'); // 'front' (Zone 0) | 'back' (Zones 1-3)

  const lastPt = useRef(null);
  const rafId = useRef(null);
  const dragRef = useRef(null); // mirror of dragItem for window listeners
  const scrollRef = useRef(null);

  // Occupied tiles (base + buffer) for every placed item.
  const occupied = useMemo(() => {
    const set = new Set();
    placed.forEach((p) => {
      const item = CATALOG_BY_KEY[p.itemKey];
      const { base, buffer } = footprint(p.zone, p.rowIndex, p.col, item);
      [...base, ...buffer].forEach(([z, r, c]) => set.add(keyOf(z, r, c)));
    });
    return set;
  }, [placed]);
  const occupiedRef = useRef(occupied);
  occupiedRef.current = occupied;

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
    const { base, buffer } = footprint(zone, rowIndex, col, item);
    const valid = [...base, ...buffer].every(([z, r, c]) =>
      cellIsFree(gridMap, occupiedRef.current, z, r, c)
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
      e.preventDefault(); // lock the map: stop iOS rubber-band scroll mid-drag
      lastPt.current = { x: e.clientX, y: e.clientY };
      if (rafId.current == null) rafId.current = requestAnimationFrame(flush);
    };

    const finish = (e) => {
      const result = computePreviewAt(e.clientX, e.clientY);
      if (result && result.valid) {
        const item = dragRef.current;
        setPlaced((prev) => [
          ...prev,
          {
            id: INSTANCE_SEQ++,
            itemKey: item.key,
            zone: result.zone,
            rowIndex: result.rowIndex,
            col: result.col,
            anchorKey: keyOf(result.zone, result.rowIndex, result.col),
          },
        ]);
      }
      cleanup();
    };

    const cleanup = () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      rafId.current = null;
      lastPt.current = null;
      dragRef.current = null;
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

  const startDrag = (item) => (e) => {
    e.preventDefault();
    dragRef.current = item;
    setDragItem(item);
    setGhost({ x: e.clientX, y: e.clientY });
    lastPt.current = { x: e.clientX, y: e.clientY };
  };

  const removePlaced = (id) => setPlaced((prev) => prev.filter((p) => p.id !== id));

  /* ---------------- render helpers ---------------- */

  // Static cells per zone — depends only on the immutable gridMap, so React
  // reuses these elements across drag frames (keeps elementFromPoint at 60fps).
  const cellsByZone = useMemo(() => {
    const out = {};
    ZONES.forEach((zone) => {
      const cells = [];
      ROWS.forEach((rowLetter, rowIndex) => {
        COLS.forEach((col) => {
          const cell = gridMap[keyOf(zone, rowIndex, col)];
          const checker = (rowIndex + col) % 2 === 0;
          const baseCls = cell.blocked
            ? 'bg-slate-300 dark:bg-slate-700'
            : checker
            ? 'bg-emerald-100 dark:bg-emerald-900/40'
            : 'bg-emerald-200 dark:bg-emerald-800/40';
          cells.push(
            <div
              key={cell.key}
              data-cell
              data-zone={zone}
              data-row={rowIndex}
              data-col={col}
              data-blocked={cell.blocked ? 'true' : 'false'}
              title={cell.label}
              className={`aspect-square border border-emerald-300/40 dark:border-emerald-950/60 ${baseCls}`}
              style={
                cell.blocked
                  ? {
                      backgroundImage:
                        'repeating-linear-gradient(45deg, rgba(100,116,139,0.45) 0 3px, transparent 3px 6px)',
                    }
                  : undefined
              }
            />
          );
        });
      });
      out[zone] = cells;
    });
    return out;
  }, [gridMap]);

  const renderPlacedOverlays = (zone) =>
    placed
      .filter((p) => p.zone === zone)
      .flatMap((p) => {
        const item = CATALOG_BY_KEY[p.itemKey];
        const nodes = [];
        if (item.clearance > 0) {
          const top = Math.max(1, p.rowIndex - item.clearance + 1);
          const span = p.rowIndex + 1 - top;
          if (span > 0) {
            nodes.push(
              <div
                key={`${p.id}-buf`}
                className="pointer-events-none z-10 rounded-sm border border-dashed border-slate-400/70 bg-slate-400/20"
                style={{ gridColumn: `${p.col} / span ${item.w}`, gridRow: `${top} / span ${span}` }}
              />
            );
          }
        }
        nodes.push(
          <div
            key={p.id}
            className={`pointer-events-none z-20 flex items-center justify-center rounded-sm text-[7px] font-semibold leading-tight text-white shadow ring-1 ring-black/30 ${item.cls}`}
            style={{ gridColumn: `${p.col} / span ${item.w}`, gridRow: `${p.rowIndex + 1} / span ${item.h}` }}
          >
            <span className="px-0.5 text-center">{item.name}</span>
          </div>
        );
        return nodes;
      });

  const renderPreviewOverlay = (zone) => {
    if (!preview || preview.zone !== zone || !dragItem) return null;
    const rawTop = preview.rowIndex - dragItem.clearance + 1;
    const top = Math.max(1, rawTop);
    const span = dragItem.h + dragItem.clearance - (top - rawTop);
    if (span <= 0) return null;
    const cls = preview.valid
      ? 'bg-green-500/40 ring-2 ring-green-500'
      : 'bg-red-500/40 ring-2 ring-red-500';
    return (
      <div
        className={`pointer-events-none z-30 rounded-sm ${cls}`}
        style={{ gridColumn: `${preview.col} / span ${dragItem.w}`, gridRow: `${top} / span ${span}` }}
      />
    );
  };

  const renderZone = (zone) => (
    <section key={zone} className="mb-6">
      <h3 className="mb-1 text-xs font-bold text-emerald-900 dark:text-emerald-200">
        {ZONE_TITLES[zone]}
      </h3>
      {/* column numbers */}
      <div className="flex">
        <div style={{ width: '1.25rem' }} />
        <div className="grid flex-1" style={{ gridTemplateColumns: COLS_TEMPLATE }}>
          {COLS.map((c) => (
            <div key={c} className="text-center text-[8px] text-neutral-500 dark:text-neutral-400">
              {c}
            </div>
          ))}
        </div>
      </div>
      <div className="flex">
        {/* row letters */}
        <div
          className="grid"
          style={{ width: '1.25rem', gridTemplateRows: 'repeat(23, 1fr)' }}
        >
          {ROWS.map((l) => (
            <div
              key={l}
              className="flex items-center justify-center text-[8px] text-neutral-500 dark:text-neutral-400"
            >
              {l}
            </div>
          ))}
        </div>
        {/* the playable matrix */}
        <div
          className="relative grid flex-1 overflow-hidden rounded-md ring-1 ring-emerald-300 dark:ring-emerald-800"
          style={{ gridTemplateColumns: COLS_TEMPLATE }}
        >
          {cellsByZone[zone]}
          {renderPlacedOverlays(zone)}
          {renderPreviewOverlay(zone)}
        </div>
      </div>
    </section>
  );

  /* ---------------- layout ---------------- */

  const visibleZones = side === 'front' ? [0] : [3, 2, 1]; // back-of-property at top

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-x-hidden bg-emerald-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* header */}
      <header className="flex items-center justify-between gap-2 border-b border-emerald-200 px-3 py-2 dark:border-emerald-900">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300">
            Sneakyscapes
          </h1>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
            Garden planner · {placed.length} item{placed.length === 1 ? '' : 's'} placed
          </p>
        </div>
        <div className="flex rounded-full bg-emerald-100 p-0.5 text-xs dark:bg-emerald-900/60">
          <button
            onClick={() => setSide('front')}
            className={`rounded-full px-3 py-1 font-medium transition ${
              side === 'front'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            Front
          </button>
          <button
            onClick={() => setSide('back')}
            className={`rounded-full px-3 py-1 font-medium transition ${
              side === 'back'
                ? 'bg-emerald-600 text-white'
                : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            Back
          </button>
        </div>
      </header>

      {/* scrollable map (Zone 0 front → Zone 3 back) */}
      <main
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3"
        style={{ touchAction: dragItem ? 'none' : 'pan-y' }}
      >
        <div className="mx-auto max-w-md">
          {visibleZones.map((z) => renderZone(z))}

          {/* placed items / maintenance panel */}
          <section className="mt-2 rounded-lg border border-emerald-200 p-3 dark:border-emerald-900">
            <h3 className="mb-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              Placed items &amp; locations
            </h3>
            {placed.length === 0 ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Drag an item from the tray onto the grid to place it.
              </p>
            ) : (
              <ul className="space-y-1">
                {placed.map((p) => {
                  const item = CATALOG_BY_KEY[p.itemKey];
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded bg-emerald-100/60 px-2 py-1 text-[11px] dark:bg-emerald-900/40"
                    >
                      <span>
                        <span className="font-semibold">{item.name}</span>{' '}
                        <span className="text-neutral-500 dark:text-neutral-400">
                          · {p.anchorKey} ({labelOf(p.zone, p.rowIndex, p.col)})
                        </span>
                      </span>
                      <button
                        onClick={() => removePlaced(p.id)}
                        className="rounded bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      {/* bottom item tray */}
      <footer className="border-t border-emerald-200 bg-emerald-50/95 px-2 py-2 backdrop-blur dark:border-emerald-900 dark:bg-neutral-950/95">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ touchAction: 'pan-x' }}>
          {CATALOG.map((item) => (
            <button
              key={item.key}
              onPointerDown={startDrag(item)}
              style={{ touchAction: 'none' }}
              className="flex w-24 shrink-0 select-none flex-col items-start gap-1 rounded-lg border border-emerald-200 bg-white p-2 text-left shadow-sm active:scale-95 dark:border-emerald-800 dark:bg-neutral-900"
            >
              <span className={`h-5 w-full rounded ${item.cls}`} />
              <span className="text-[11px] font-semibold leading-tight">{item.name}</span>
              <span className="text-[9px] text-neutral-500 dark:text-neutral-400">
                {item.w}×{item.h}
                {item.clearance ? ` (+${item.clearance} buffer)` : ''} · {item.price} pts
              </span>
              <span className="text-[9px] text-emerald-700 dark:text-emerald-400">
                {item.available > 99 ? '∞' : item.available} available
              </span>
            </button>
          ))}
        </div>
      </footer>

      {/* floating drag chip following the finger */}
      {ghost && dragItem && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[10px] font-semibold text-white shadow-lg ring-1 ring-black/30"
          style={{ left: ghost.x, top: ghost.y, backgroundColor: 'rgba(16,185,129,0.95)' }}
        >
          {dragItem.name}
        </div>
      )}
    </div>
  );
}
