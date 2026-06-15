import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { resolveItemSprite, resolveBaseTile, resolveHouseSprite } from '../game/sprites.js';

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

// View stacks (top -> bottom). Back-of-property (Zone 3) sits at the top.
const FRONT_STACK = [0];
const BACK_STACK = [3, 2, 1];
const stackForZone = (zone) => (zone === 0 ? FRONT_STACK : BACK_STACK);

// Placeholder — the player will name their plot during game setup later.
const SNEAKYSCAPE_NAME = "Katie's Sneakyscape";
// Tabbed menu pages — Stardew-style. Add more pages here as the game grows.
const PANEL_TABS = [
  { key: 'items', label: 'Items' },
  { key: 'info', label: 'Info' },
];
const SLOT_MIN = 12; // pad the inventory grid out with empty slots

// Time-based growth: a placed item with growthStages advances one stage every
// growthHours since placedAt (e.g. grass: short@2h, medium@4h, long@6h). Returns
// the current stage token, or null before the first stage (→ 'default' sprite).
// (Later this will be modulated by the weather API / watering.)
function derivedGrowth(item, placedAt, nowMs) {
  if (!item.growthStages || !placedAt) return null;
  const hours = (nowMs - placedAt) / 3600000;
  const stageIndex = Math.floor(hours / (item.growthHours || 2)) - 1;
  if (stageIndex < 0) return null;
  return item.growthStages[Math.min(stageIndex, item.growthStages.length - 1)];
}

// Astronomical seasons (N. hemisphere). Boundaries: Spring 20 Mar, Summer 21 Jun,
// Autumn 22 Sep, Winter 21 Dec. Returns 'spring'|'summer'|'autumn'|'winter'.
function seasonForDate(d) {
  const md = (d.getMonth() + 1) * 100 + d.getDate(); // e.g. 15 Jun → 615
  if (md >= 1221 || md <= 319) return 'winter';
  if (md <= 620) return 'spring';
  if (md <= 921) return 'summer';
  return 'autumn';
}

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
/* w = width (cols), h = base depth (rows).                           */
/* TWO kinds of "tall":                                               */
/*  - clearance: N → solid structure (shed). Reserves/BLOCKS N tiles  */
/*    behind it; nothing can be placed there.                         */
/*  - spriteH: total rows the SPRITE spans (>= h). The art overdraws   */
/*    upward (behind), but blocks NOTHING — you can place/walk behind  */
/*    a tall shrub. Only affects rendering when a sprite is present;   */
/*    the flat colour fallback always uses the footprint size.         */
/*  - spriteHByState: { <growth>: rows } overrides spriteH per state,  */
/*    rows may be fractional, e.g. grass { long: 1.5 } → long grass    */
/*    rises 1.5 tiles, short stays 1.                                  */
/* Items are depth-sorted front→back: lower on screen draws in front.  */
/*                                                                    */
/* STATE / VARIANT MODEL (drives which sprite shows):                 */
/*  - Global scene (env): { season, weather, timeOfDay } — shared by  */
/*    the whole garden, weather/season to be fed by a weather API.    */
/*  - Per-placed-item state (stored on the instance, JSONB-friendly): */
/*      growth?  : 'bare' | 'sprout' | 'bloom' | ...  (plant lifecycle)*/
/*      watered? : boolean                            (false → 'dry') */
/*      device?  : { provider, id, state } | null     (IoT link, later)*/
/*    These live ON the placement object, so adding/using them needs  */
/*    NO DB migration. The sprite resolver (game/sprites.js) turns     */
/*    scene + state into the best available sprite, falling back to    */
/*    'default' then the flat colour block.                            */
/* ------------------------------------------------------------------ */

const CATALOG = [
  { key: 'grass', name: 'Grass', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, color: '#43a047', desc: 'Flat lawn turf.', growthStages: ['short', 'medium', 'long'], growthHours: 2, spriteHByState: { long: 1.5 } },
  { key: 'soil', name: 'Soil', type: 'terrain', w: 1, h: 1, clearance: 0, price: 5, available: 999, color: '#7c4a1e', desc: 'Bare planting soil.' },
  { key: 'gravel', name: 'Gravel', type: 'terrain', w: 1, h: 1, clearance: 0, price: 8, available: 999, color: '#9aa0a6', desc: 'Decorative gravel path.' },
  { key: 'hydrangea', name: 'Hydrangea', type: 'entity', w: 1, h: 1, clearance: 0, spriteH: 2, price: 40, available: 12, color: '#3d9be0', desc: 'Flowering shrub. Needs regular watering.' },
  { key: 'bench', name: 'Garden Bench', type: 'entity', w: 2, h: 1, clearance: 0, price: 120, available: 4, color: '#9c6b27', desc: 'A two-seat garden bench.' },
  { key: 'shed', name: 'Garden Office / Shed', type: 'entity', w: 5, h: 4, clearance: 2, price: 1500, available: 1, color: '#6b7280', desc: 'Tall structure — casts a 2-tile shadow footprint behind it.' },
  { key: 'trampoline', name: 'Trampoline', type: 'entity', w: 5, h: 5, clearance: 0, price: 600, available: 1, color: '#5b54d6', desc: "A kids' trampoline." },
];
const CATALOG_BY_KEY = Object.fromEntries(CATALOG.map((i) => [i.key, i]));

/**
 * Local cell offsets for an item at a given rotation, anchored so the BASE
 * top-left stays at (0,0). Base cells in rot 0 occupy rows 0..h-1, cols 0..w-1;
 * the shadow buffer sits at negative rows (behind). Rotating turns the whole
 * shape (base + shadow together) 90° clockwise per step, so the shadow stays on
 * the correct side. Each entry: { r, c, buf }.
 */
function rotatedCells(item, rot = 0) {
  const pts = [];
  for (let r = 0; r < item.h; r++) for (let c = 0; c < item.w; c++) pts.push({ r, c, buf: false });
  for (let r = 1; r <= item.clearance; r++) for (let c = 0; c < item.w; c++) pts.push({ r: -r, c, buf: true });
  const k = ((rot % 4) + 4) % 4;
  return pts.map((p) => {
    let r = p.r;
    let c = p.c;
    for (let i = 0; i < k; i++) { const nr = c; const nc = -r; r = nr; c = nc; } // 90° CW
    return { r, c, buf: p.buf };
  });
}

/** Bounding box { r0, c0, w, h } of a set of {r,c} cells. */
function bbox(cells) {
  const rs = cells.map((p) => p.r);
  const cs = cells.map((p) => p.c);
  const r0 = Math.min(...rs);
  const c0 = Math.min(...cs);
  return { r0, c0, h: Math.max(...rs) - r0 + 1, w: Math.max(...cs) - c0 + 1 };
}

/**
 * Resolve an item's footprint (rotation-aware) within a given view stack.
 * Returns one entry per occupied tile: { inBounds, key }.
 */
function resolveFootprint(stack, zone, rowIndex, col, item, rot = 0) {
  const totalRows = stack.length * 23;
  const gAnchor = stack.indexOf(zone) * 23 + rowIndex;
  return rotatedCells(item, rot).map(({ r, c }) => {
    const g = gAnchor + r;
    const cc = col + c;
    const inBounds = g >= 0 && g < totalRows && cc >= 1 && cc <= 13;
    if (!inBounds) return { inBounds: false, key: null };
    const z = stack[Math.floor(g / 23)];
    const ri = g % 23;
    return { inBounds: true, key: keyOf(z, ri, cc) };
  });
}

let INSTANCE_SEQ = 1;

// --- Local persistence -------------------------------------------------------
// Placements survive a browser refresh by round-tripping through localStorage.
// The stored shape (array of { id, itemKey, zone, rowIndex, col, anchorKey }) is
// already JSONB-friendly, so this same payload can be POSTed to the backend and
// stored per-user in Postgres later with no restructuring.
const STORAGE_KEY = 'sneakyscapes:placed:v1';

// Keep only well-formed rows that reference a known item; normalise rotation;
// advance the id sequence past anything restored to avoid id collisions.
function sanitizePlaced(data) {
  if (!Array.isArray(data)) return [];
  const clean = data
    .filter(
      (p) =>
        p && CATALOG_BY_KEY[p.itemKey] &&
        Number.isInteger(p.rowIndex) && Number.isInteger(p.col) && [0, 1, 2, 3].includes(p.zone)
    )
    .map((p) => ({ ...p, rot: ((Number(p.rot) || 0) % 4 + 4) % 4 }));
  const maxId = clean.reduce((m, p) => Math.max(m, p.id || 0), 0);
  if (maxId >= INSTANCE_SEQ) INSTANCE_SEQ = maxId + 1;
  return clean;
}

function loadPlaced() {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizePlaced(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function SneakyscapesPage() {
  const navigate = useNavigate();
  const gridMap = useMemo(() => buildGridMap(), []);

  const [placed, setPlaced] = useState(loadPlaced); // {id, itemKey, zone, rowIndex, col, anchorKey}
  const [dragItem, setDragItem] = useState(null);
  const [ghost, setGhost] = useState(null); // {x,y}
  const [preview, setPreview] = useState(null); // {zone, rowIndex, col, valid}
  const [side, setSide] = useState('back'); // 'front' | 'back'
  const [movingId, setMovingId] = useState(null);
  const [locked, setLocked] = useState(true); // when locked, touches pan the map instead of dragging items
  const [menu, setMenu] = useState(null); // {id, x, y} long-press popout
  const [dupCount, setDupCount] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false); // Stardew menu panel
  const [panelTab, setPanelTab] = useState('items');
  const [panelSearch, setPanelSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('grass'); // inspected item in the shop grid
  const [now, setNow] = useState(() => new Date());
  // Scene drives sprite variants. season/weather will come from a weather API
  // later; time 'auto' follows the clock. Overridable here for testing art.
  const [scene, setScene] = useState({ season: 'auto', weather: 'clear', time: 'auto' });
  const swipeX = useRef(null);

  const lastPt = useRef(null);
  const rafId = useRef(null);
  const dragRef = useRef(null);
  const movingRef = useRef(null);
  const dragRotRef = useRef(0); // rotation (0..3) of the item currently being dragged
  const dragGrowthRef = useRef(null); // explicit growth/variant for the item being placed (null = auto)
  const lastTapRef = useRef({ id: null, t: 0 }); // double-tap-to-rotate tracking
  const hydratedRef = useRef(false); // true once the server layout has loaded
  const saveTimer = useRef(null);
  const dirtyRef = useRef(false); // local edits awaiting a save (don't let polling clobber them)
  const lastSyncedAt = useRef(null); // server updated_at we last loaded/saved
  const applyingRemoteRef = useRef(false); // a setPlaced caused by remote data — don't echo it back

  // Occupied tiles (base + shadow). The item being moved is excluded.
  const occupied = useMemo(() => {
    const set = new Set();
    placed.forEach((p) => {
      if (p.id === movingId) return;
      const item = CATALOG_BY_KEY[p.itemKey];
      resolveFootprint(stackForZone(p.zone), p.zone, p.rowIndex, p.col, item, p.rot).forEach((x) => {
        if (x.inBounds) set.add(x.key);
      });
    });
    return set;
  }, [placed, movingId]);
  const occupiedRef = useRef(occupied);
  occupiedRef.current = occupied;
  const placedRef = useRef(placed);
  placedRef.current = placed;

  // Load the shared layout from the server (syncs across devices & both users).
  // localStorage seeded the initial state for an instant paint; if the server
  // is empty but we have local placements (first run after this feature shipped)
  // we migrate the local layout up instead of wiping it.
  useEffect(() => {
    let cancelled = false;
    api.getSneakyscapes()
      .then((res) => {
        if (cancelled) return;
        const serverPlaced = sanitizePlaced(res?.placements);
        if (serverPlaced.length === 0 && placedRef.current.length > 0) {
          api.saveSneakyscapes(placedRef.current)
            .then((resp) => { if (resp?.updated_at) lastSyncedAt.current = resp.updated_at; })
            .catch(() => {});
        } else {
          lastSyncedAt.current = res?.updated_at ?? null;
          applyingRemoteRef.current = true; // don't echo this back to the server
          setPlaced(serverPlaced);
        }
      })
      .catch(() => { /* offline / unauthenticated — keep the local copy */ })
      .finally(() => { if (!cancelled) hydratedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  // Persist placements: instant localStorage cache + debounced server save.
  // Gated on hydration so we never overwrite the server with the local cache
  // before we've loaded it.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placed));
    } catch {
      /* storage unavailable (private mode / quota) — keep going in-memory */
    }
    if (!hydratedRef.current) return;
    if (applyingRemoteRef.current) { applyingRemoteRef.current = false; return; } // came from server — don't re-save
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveSneakyscapes(placed)
        .then((resp) => { if (resp?.updated_at) lastSyncedAt.current = resp.updated_at; dirtyRef.current = false; })
        .catch(() => {});
    }, 600);
  }, [placed]);

  // Poll the shared layout every 4s so the other device's changes appear live.
  // Cheap: one tiny singleton SELECT against your own server, no external cost.
  // Skipped while you're dragging or have unsaved local edits, so it never
  // clobbers in-progress work.
  useEffect(() => {
    const id = setInterval(async () => {
      if (!hydratedRef.current || dirtyRef.current || dragRef.current) return;
      try {
        const res = await api.getSneakyscapes();
        if (res && res.updated_at && res.updated_at !== lastSyncedAt.current) {
          lastSyncedAt.current = res.updated_at;
          applyingRemoteRef.current = true;
          setPlaced(sanitizePlaced(res.placements));
        }
      } catch { /* ignore transient errors */ }
    }, 4000);
    return () => clearInterval(id);
  }, []);

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
  const startDragFromPanel = (item, x, y, growth = null) => {
    setPanelOpen(false);
    movingRef.current = null;
    setMovingId(null);
    dragRef.current = item;
    dragRotRef.current = 0; // fresh item — no rotation yet
    dragGrowthRef.current = growth; // explicit length/variant, or null = auto-grow
    setDragItem(item);
    setGhost({ x, y });
    lastPt.current = { x, y };
  };

  // Drag a specific variant thumbnail (e.g. a grass length) out onto the grid.
  const onVariantPointerDown = (item, growth) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        teardown();
        startDragFromPanel(item, ev.clientX, ev.clientY, growth);
      }
    };
    const up = () => teardown();
    const teardown = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Inventory-slot gesture: tap = inspect (show detail), drag = place on the grid.
  const onSlotPointerDown = (item) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedKey(item.key);
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        teardown();
        startDragFromPanel(item, ev.clientX, ev.clientY);
      }
    };
    const up = () => teardown();
    const teardown = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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
    const rot = dragRotRef.current;
    const cells = resolveFootprint(stackForZone(zone), zone, rowIndex, col, item, rot);
    const valid = cells.every(
      (x) => x.inBounds && !gridMap[x.key].blocked && !occupiedRef.current.has(x.key)
    );
    return { zone, rowIndex, col, valid, rot };
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
            { id: INSTANCE_SEQ++, itemKey: item.key, zone: result.zone, rowIndex: result.rowIndex, col: result.col, anchorKey, rot: result.rot || 0, placedAt: Date.now(), ...(dragGrowthRef.current ? { growth: dragGrowthRef.current } : {}) },
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
    dragRotRef.current = p.rot || 0; // re-dragging keeps the item's set rotation
    dragGrowthRef.current = null; // moving preserves the instance's existing growth
    setDragItem(item);
    setGhost({ x, y });
    lastPt.current = { x, y };
  };

  // Rotate a placed item 90° clockwise — only if the rotated footprint still
  // fits at the same anchor (otherwise the rotation is ignored).
  const rotatePlaced = (id) => {
    setPlaced((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const item = CATALOG_BY_KEY[p.itemKey];
        const nextRot = ((p.rot || 0) + 1) % 4;
        const occ = new Set();
        prev.forEach((o) => {
          if (o.id === id) return;
          const it = CATALOG_BY_KEY[o.itemKey];
          resolveFootprint(stackForZone(o.zone), o.zone, o.rowIndex, o.col, it, o.rot).forEach((x) => {
            if (x.inBounds) occ.add(x.key);
          });
        });
        const cells = resolveFootprint(stackForZone(p.zone), p.zone, p.rowIndex, p.col, item, nextRot);
        const fits = cells.every((x) => x.inBounds && !gridMap[x.key].blocked && !occ.has(x.key));
        return fits ? { ...p, rot: nextRot } : p;
      })
    );
  };

  // Gesture on a placed item: drag = move · long-press = menu · double-tap = rotate.
  const onItemPointerDown = (p) => (e) => {
    if (dragRef.current || menu) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let longFired = false;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
        teardown();
        beginMove(p, ev.clientX, ev.clientY);
      }
    };
    const up = () => {
      teardown();
      if (longFired) return;
      const t = Date.now();
      if (lastTapRef.current.id === p.id && t - lastTapRef.current.t < 400) {
        lastTapRef.current = { id: null, t: 0 };
        rotatePlaced(p.id); // second quick tap → rotate
      } else {
        lastTapRef.current = { id: p.id, t };
      }
    };
    const timer = setTimeout(() => {
      longFired = true;
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

  const clearAll = () => {
    if (placed.length === 0) return;
    if (typeof window !== 'undefined' && !window.confirm('Remove every item from the whole garden?')) return;
    setPlaced([]); // persists the empty layout to the server + cache
  };

  // Small "front-edge" marker so rotation is visible even on square items.
  const frontEdgeStyle = (rot) => {
    const base = { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 1 };
    switch (((rot % 4) + 4) % 4) {
      case 0: return { ...base, left: 2, right: 2, bottom: 1, height: 3 };
      case 1: return { ...base, top: 2, bottom: 2, left: 1, width: 3 };
      case 2: return { ...base, left: 2, right: 2, top: 1, height: 3 };
      default: return { ...base, top: 2, bottom: 2, right: 1, width: 3 };
    }
  };

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
        const cells = resolveFootprint(stack, z, ri, c, item, src.rot);
        const ok = cells.every((x) => x.inBounds && !gridMap[x.key].blocked && !occ.has(x.key));
        if (ok) {
          cells.forEach((x) => occ.add(x.key));
          copies.push({ id: INSTANCE_SEQ++, itemKey: item.key, zone: z, rowIndex: ri, col: c, anchorKey: keyOf(z, ri, c), rot: src.rot || 0, placedAt: src.placedAt ?? Date.now(), ...(src.growth ? { growth: src.growth } : {}) });
        }
      }
    }
    if (copies.length) setPlaced((prev) => [...prev, ...copies]);
  };

  /* ---------------- scene / environment (drives sprite variants) ---------------- */

  const hour = now.getHours();
  const phase = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const timeOfDay = scene.time !== 'auto' ? scene.time : (hour < 6 || hour >= 20 ? 'night' : 'day');
  const season = scene.season !== 'auto' ? scene.season : seasonForDate(now); // date-driven unless overridden
  const env = { season, weather: scene.weather, timeOfDay };
  const baseTile = resolveBaseTile(env);

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
            if (cell.blocked) {
              style.backgroundImage = HOUSE_HATCH;
            } else if (baseTile) {
              // ground sprite (pixel-art crisp), checker colour stays as fallback
              style.backgroundImage = `url(${baseTile})`;
              style.backgroundSize = '100% 100%';
              style.imageRendering = 'pixelated';
            }
            els.push(
              <div key={cell.key} data-cell data-zone={zone} data-row={ri} data-col={col}
                data-blocked={cell.blocked ? 'true' : 'false'} title={cell.label}
                style={style} className="min-h-0 min-w-0" />
            );
          });
        });
      });
      return els;
    };
    return { front: make(FRONT_STACK), back: make(BACK_STACK) };
  }, [gridMap, baseTile]);

  /* ---------------- dynamic overlays ---------------- */

  const renderPlacedOverlays = (stack) =>
    placed
      .filter((p) => stack.includes(p.zone) && p.id !== movingId)
      .flatMap((p) => {
        const item = CATALOG_BY_KEY[p.itemKey];
        const gTop = stack.indexOf(p.zone) * 23 + p.rowIndex;
        const cells = rotatedCells(item, p.rot);
        const baseCells = cells.filter((c) => !c.buf);
        const bufCells = cells.filter((c) => c.buf);
        const b = bbox(baseCells);
        const nodes = [];
        if (bufCells.length) {
          const f = bbox(bufCells);
          nodes.push(
            <div key={`${p.id}-buf`}
              style={{ gridColumn: `${p.col + f.c0} / span ${f.w}`, gridRow: `${gTop + f.r0 + 1} / span ${f.h}`, backgroundColor: SHADOW_FILL, backgroundImage: SHADOW_HATCH }}
              className="pointer-events-none z-10 border border-dashed border-black/40" />
          );
        }
        // Time-based growth (e.g. grass length) is derived from placedAt, so it
        // advances on its own as the clock ticks. Doesn't override an explicit growth.
        const grown = p.growth ?? derivedGrowth(item, p.placedAt, now.getTime());
        const sprite = resolveItemSprite(item.key, env, grown ? { ...p, growth: grown } : p);

        // Visual height as a multiple of the footprint height. Can be fractional
        // (e.g. long grass = 1.5 tiles). The body always occupies just the
        // footprint; a taller sprite OVERDRAWS upward via overflow (no blocking).
        // Only for upright rotations (refined in Pixi).
        const effSpriteH = (grown && item.spriteHByState?.[grown]) || item.spriteH || item.h;
        const heightPct = sprite && !p.rot ? (effSpriteH / b.h) * 100 : 100;

        // Depth sort: items lower on screen (larger bottom row) render in front.
        const bottomRow = gTop + b.r0 + b.h;
        const bodyStyle = {
          gridColumn: `${p.col + b.c0} / span ${b.w}`,
          gridRow: `${gTop + b.r0 + 1} / span ${b.h}`,
          zIndex: 20 + bottomRow,
          overflow: sprite ? 'visible' : 'hidden', // let tall sprites spill upward
          // locked → ignore touches so the map pans; unlocked → grabbable
          pointerEvents: dragItem || locked ? 'none' : 'auto',
          touchAction: 'none',
        };
        if (!sprite) {
          bodyStyle.backgroundColor = item.color;
          bodyStyle.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.35)';
        }
        nodes.push(
          <div key={p.id} onPointerDown={locked ? undefined : onItemPointerDown(p)} style={bodyStyle}
            className="relative flex min-h-0 min-w-0 cursor-grab touch-none items-center justify-center text-[7px] font-semibold leading-tight text-white active:cursor-grabbing">
            {sprite ? (
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${heightPct}%`, backgroundImage: `url(${sprite})`, backgroundSize: '100% 100%', backgroundPosition: 'bottom', imageRendering: 'pixelated' }} />
            ) : (
              <>
                <span className="px-0.5 text-center drop-shadow">{item.name}</span>
                <span style={frontEdgeStyle(p.rot)} />
              </>
            )}
          </div>
        );
        return nodes;
      });

  const renderPreviewOverlay = (stack) => {
    if (!preview || !dragItem || !stack.includes(preview.zone)) return null;
    const gTop = stack.indexOf(preview.zone) * 23 + preview.rowIndex;
    const box = bbox(rotatedCells(dragItem, preview.rot)); // base + shadow combined
    return (
      <div className="pointer-events-none"
        style={{
          gridColumn: `${preview.col + box.c0} / span ${box.w}`,
          gridRow: `${gTop + box.r0 + 1} / span ${box.h}`,
          zIndex: 9999, // always above the depth-sorted items
          backgroundColor: preview.valid ? 'rgba(34,197,94,0.40)' : 'rgba(239,68,68,0.42)',
          boxShadow: preview.valid ? 'inset 0 0 0 2px #16a34a' : 'inset 0 0 0 2px #dc2626',
        }} />
    );
  };

  const renderBoard = (stack, cells) => {
    const totalRows = stack.length * 23;
    const isFront = stack.length === 1 && stack[0] === 0;
    const house = isFront ? resolveHouseSprite('front') : null;
    return (
      // Fixed aspect-ratio + equal 1fr rows/cols → every cell is a TRUE square and
      // overlays land exactly on the same grid lines (no sub-pixel drift).
      <div className="relative grid w-full select-none"
        style={{
          gridTemplateColumns: 'repeat(13, 1fr)',
          gridTemplateRows: `repeat(${totalRows}, 1fr)`,
          aspectRatio: `13 / ${totalRows}`,
        }}>
        {cells}
        {house && (
          // House image spans the whole front grid; the art is transparent over
          // the playable bottom-right. Sits under placed items, ignores touches.
          <div className="pointer-events-none"
            style={{ gridColumn: '1 / span 13', gridRow: '1 / span 23', backgroundImage: `url(${house})`, backgroundSize: '100% 100%', imageRendering: 'pixelated', zIndex: 5 }} />
        )}
        {renderPlacedOverlays(stack)}
        {renderPreviewOverlay(stack)}
      </div>
    );
  };

  /* ---------------- layout ---------------- */

  const menuItem = menu ? placed.find((p) => p.id === menu.id) : null;
  const menuCat = menuItem ? CATALOG_BY_KEY[menuItem.itemKey] : null;
  const actions = []; // future: [{ id, text, due }] e.g. "Water Hydrangea today between …"

  // Shop / inventory derived data
  const spent = placed.reduce((s, p) => s + (CATALOG_BY_KEY[p.itemKey]?.price || 0), 0);
  const filteredItems = CATALOG.filter((i) =>
    i.name.toLowerCase().includes(panelSearch.trim().toLowerCase())
  );
  const selectedItem = CATALOG_BY_KEY[selectedKey] || null;
  const slots = [...filteredItems];
  while (slots.length < SLOT_MIN || slots.length % 4 !== 0) slots.push(null);

  // Floating HUD sits clear of the iPhone status bar / notch.
  const hudTop = 'calc(env(safe-area-inset-top, 0px) + 10px)';
  // Pixel-style clock label, e.g. "08:47 Mon 15 June — Spring".
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const weekday = now.toLocaleDateString(undefined, { weekday: 'short' });
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  const seasonName = season.charAt(0).toUpperCase() + season.slice(1);
  const clockLabel = `${hhmm} ${weekday} ${now.getDate()} ${monthName} — ${seasonName}`;

  return (
    // Fixed full-viewport overlay ABOVE the app header (z-50) → true full-screen,
    // and nothing inside can paint over the app nav. The X exits back to home.
    <div className="fixed inset-0 z-50 overflow-hidden" style={{ height: '100dvh', backgroundColor: UI.frame }}>
      {/* full-screen game canvas. isolate: contains the per-item depth z-indexes
          so they can't paint over the HUD clock / menu / drag chip. */}
      <div className="h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ touchAction: dragItem ? 'none' : 'pan-y', isolation: 'isolate' }}>
        {side === 'front' ? renderBoard(FRONT_STACK, boards.front) : renderBoard(BACK_STACK, boards.back)}
      </div>

      {/* centered pixel clock/date — tap to open the menu */}
      <button onClick={() => { setPanelTab('items'); setPanelOpen(true); }} aria-label="Open menu"
        className="absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 active:scale-95"
        style={{
          top: hudTop,
          color: UI.text,
          fontFamily: 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace',
          fontWeight: 800,
          fontSize: '14px',
          letterSpacing: '0.3px',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 2px 6px rgba(0,0,0,0.7)',
        }}>
        {clockLabel}
      </button>

      {/* lock toggle (top-right) — locked by default so panning doesn't drag items */}
      <button onClick={() => setLocked((v) => !v)} aria-label={locked ? 'Unlock items' : 'Lock items'}
        className="absolute right-3 z-40 flex h-10 w-10 items-center justify-center rounded-xl active:scale-95"
        style={{ top: hudTop, backgroundColor: UI.hud, border: `1px solid ${UI.border}`, color: locked ? UI.text : UI.accent, boxShadow: '0 4px 12px rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
        {locked ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0" />
          </svg>
        )}
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

      {/* central Stardew-style menu modal */}
      {panelOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3">
          <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onPointerDown={() => setPanelOpen(false)} />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{ backgroundColor: UI.panel, border: `1px solid ${UI.border}`, color: UI.text }}>

            {/* tab strip + points + close */}
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="flex flex-1 gap-1">
                {PANEL_TABS.map((t) => (
                  <button key={t.key} onClick={() => setPanelTab(t.key)}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold"
                    style={panelTab === t.key
                      ? { backgroundColor: UI.accent, color: UI.accentInk }
                      : { backgroundColor: UI.raised, color: UI.muted }}>
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="rounded-lg px-2 py-1 text-xs font-bold" style={{ backgroundColor: UI.raised, color: UI.accent }}>
                {spent} pts spent
              </span>
              <button onClick={() => setPanelOpen(false)} aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-lg" style={{ backgroundColor: UI.raised, color: UI.text }}>✕</button>
            </div>

            {/* content */}
            <div className="flex-1 overflow-y-auto p-3" style={{ touchAction: 'pan-y' }}
              onPointerDown={onPanelDown} onPointerUp={onPanelUp}>

              {panelTab === 'items' && (
                <div className="space-y-3">
                  {/* search */}
                  <input value={panelSearch} onChange={(e) => setPanelSearch(e.target.value)}
                    placeholder="Search items…"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: UI.raised, color: UI.text, border: `1px solid ${UI.border}` }} />

                  {/* inventory slot grid */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {slots.map((item, i) => (
                      <div key={item ? item.key : `empty-${i}`}
                        onPointerDown={item ? onSlotPointerDown(item) : undefined}
                        style={{
                          touchAction: 'none',
                          backgroundColor: UI.raised,
                          border: `2px solid ${item && selectedKey === item.key ? UI.accent : UI.border}`,
                        }}
                        className={`relative flex aspect-square select-none flex-col items-center justify-center rounded-lg p-1 ${item ? 'cursor-grab active:scale-95' : ''}`}>
                        {item && (
                          <>
                            <span className="h-6 w-6 rounded" style={{ backgroundColor: item.color }} />
                            <span className="mt-0.5 w-full truncate text-center text-[8px] font-semibold leading-tight">{item.name}</span>
                            <span className="absolute bottom-0.5 right-1 text-[8px] font-bold" style={{ color: UI.accent }}>{item.price}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* variant thumbnails (e.g. grass lengths) — drag one onto the grid */}
                  {selectedItem?.growthStages && (
                    <div className="flex gap-1.5">
                      {['default', ...selectedItem.growthStages].map((g) => {
                        const url = resolveItemSprite(selectedItem.key, env, g === 'default' ? {} : { growth: g });
                        return (
                          <div key={g}
                            onPointerDown={onVariantPointerDown(selectedItem, g === 'default' ? null : g)}
                            style={{
                              touchAction: 'none',
                              border: `1px solid ${UI.border}`,
                              backgroundColor: url ? UI.raised : selectedItem.color,
                              backgroundImage: url ? `url(${url})` : undefined,
                              backgroundSize: 'contain',
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'bottom',
                              imageRendering: 'pixelated',
                            }}
                            className="h-12 w-12 shrink-0 cursor-grab rounded-lg active:scale-95" />
                        );
                      })}
                    </div>
                  )}

                  {/* selected item detail panel */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: UI.raised, border: `1px solid ${UI.border}` }}>
                    {selectedItem ? (
                      <div className="flex gap-3">
                        <span className="h-12 w-12 shrink-0 rounded" style={{ backgroundColor: selectedItem.color }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-bold">{selectedItem.name}</p>
                            <p className="shrink-0 text-sm font-bold" style={{ color: UI.accent }}>
                              {selectedItem.price} pt{selectedItem.price === 1 ? '' : 's'}
                            </p>
                          </div>
                          <p className="text-[11px]" style={{ color: UI.muted }}>{selectedItem.desc}</p>
                          <p className="mt-1 text-[10px]" style={{ color: UI.muted }}>
                            Size {selectedItem.w}×{selectedItem.h}
                            {selectedItem.clearance ? ` (+${selectedItem.clearance}-tile shadow)` : ''} ·{' '}
                            {selectedItem.available > 99 ? '∞' : selectedItem.available} available
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px]" style={{ color: UI.muted }}>Tap a slot to inspect an item.</p>
                    )}
                    <p className="mt-2 text-center text-[10px]" style={{ color: UI.muted }}>Tap a slot to inspect · drag it onto the grid to place.</p>
                  </div>
                </div>
              )}

              {panelTab === 'info' && (
                <div className="space-y-3">
                  <div className="rounded-xl p-3" style={{ backgroundColor: UI.raised }}>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Sneakyscape</p>
                    <p className="text-lg font-extrabold">{SNEAKYSCAPE_NAME}</p>
                    <div className="mt-2 flex gap-4 text-sm">
                      <span><span style={{ color: UI.muted }}>Items placed:</span> <b>{placed.length}</b></span>
                      <span><span style={{ color: UI.muted }}>Spent:</span> <b style={{ color: UI.accent }}>{spent} pts</b></span>
                    </div>
                  </div>

                  {/* viewing area selector (was the Map tab) */}
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Viewing area</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['front', 'back'].map((s) => (
                        <button key={s} onClick={() => setSide(s)}
                          className="rounded-xl p-3 text-sm font-bold capitalize"
                          style={side === s
                            ? { backgroundColor: UI.accent, color: UI.accentInk }
                            : { backgroundColor: UI.raised, color: UI.muted, border: `1px solid ${UI.border}` }}>
                          {s} garden
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* scene tester — preview sprite variants (season/weather/time will be API-driven later) */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: UI.raised }}>
                    <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: UI.muted }}>Scene (testing)</p>
                    {[
                      { key: 'season', label: 'Season', opts: ['auto', 'spring', 'summer', 'autumn', 'winter'] },
                      { key: 'weather', label: 'Weather', opts: ['clear', 'rain', 'snow'] },
                      { key: 'time', label: 'Time', opts: ['auto', 'day', 'night'] },
                    ].map((row) => (
                      <div key={row.key} className="mb-2 last:mb-0">
                        <p className="mb-1 text-[10px]" style={{ color: UI.muted }}>{row.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {row.opts.map((o) => (
                            <button key={o} onClick={() => setScene((s) => ({ ...s, [row.key]: o }))}
                              className="rounded-md px-2 py-1 text-[11px] font-semibold capitalize"
                              style={scene[row.key] === o
                                ? { backgroundColor: UI.accent, color: UI.accentInk }
                                : { backgroundColor: UI.panel, color: UI.muted, border: `1px solid ${UI.border}` }}>
                              {o}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
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

                  {/* wipe the whole garden */}
                  <button onClick={clearAll} disabled={placed.length === 0}
                    style={{ backgroundColor: '#6b7280', opacity: placed.length === 0 ? 0.4 : 1 }}
                    className="w-full rounded-xl py-2 text-sm font-semibold text-white">
                    Clear all items
                  </button>

                  {/* quit the game (back to the app) */}
                  <button onClick={() => navigate('/')}
                    style={{ backgroundColor: '#b3402f' }}
                    className="w-full rounded-xl py-2 text-sm font-semibold text-white">
                    Quit
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
