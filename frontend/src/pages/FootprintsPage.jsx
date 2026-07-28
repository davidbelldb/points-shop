import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleMap, OverlayViewF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { MARAUDERS_STYLE, PARCHMENT, ROUTE } from '../lib/marauderMapStyle.js';
import { createFloorplanOverlay } from '../lib/floorplanOverlay.js';
import { isSimOn, subscribeSim } from '../lib/footprintsSim.js';
import { isCalibratorShown, subscribeCalibrator, setCalibratorShown } from '../lib/footprintsCalibrator.js';
import FloorplanControls from './FloorplanControls.jsx';

/*
 * "Marauder's Map" — a fading trail of footprints tracing where the broadcaster
 * (David) has been. Footprints are resampled from the raw GPS path at a manual
 * `spacing_m`, each one pointing along the direction of travel with a random ±15°
 * angle for that hand-inked authenticity, and fading out over `fade_seconds`.
 *
 * Outdoor phone GPS, David-only (testing). Tracking is started/ended from the Admin
 * → Marauder's Map section (so it keeps running as David moves between pages).
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
// Katie's house — 52°11'08.9"N 0°08'31.2"E. The map opens here at max zoom.
const DEFAULT_CENTER = { lat: 52.185806, lng: 0.142000 };
const MODE = 'outdoor';
const JITTER_DEG = 15;          // ±15° hand-drawn wobble
const FOLLOW_ZOOM = 20;         // footprint SIZING reference (do not change — it sets the print size)
const DEFAULT_ZOOM = 22;        // open as zoomed-in as the map allows (Google clamps to its true max)
const SIM_SPACING_M = 0.4;      // tight house-scale stride between simulated prints (real GPS uses the admin spacing)
const SVG_W = 407, SVG_H = 2339; // floorplan raster resolution for the wall-collision mask (≈ viewBox)
const WALL_BUFFER_PX = 6;        // small safe-zone: grow walls by ~6 SVG px so prints keep off them
const TEXTURE_URL = '/marauders_texture.jpg?v=2';   // bump ?v when the texture changes (busts cache)
const TEXTURE_OPACITY = 0.4;    // aged-parchment texture laid over the map
const TEXTURE_SATURATION = 1.6; // boost the texture's colour
const FOOT_REAL_M = 1.094;      // footprint length in metres AT THE FOLLOW ZOOM (+25% again)

// Katie's house floorplan overlay (blinco_floorplan.svg). ASPECT = viewBox H / W.
// DEFAULT_CAL is the best-guess georeferencing; David tunes it live with the on-map
// calibrator (drag / rotate / scale) and the locked-in numbers get baked in here.
const FLOORPLAN_URL = '/blinco_floorplan.svg?v=4';
const FLOORPLAN_ASPECT = 2338.73 / 407.04;   // "long" floorplan — much taller than wide
const FLOORPLAN_CAL_KEY = 'blincoFloorplanCal_long';   // new key → fresh calibration for the long floorplan
// mapHeading rotates the WHOLE map (roads + floorplan + footprints) so Katie's house
// — which doesn't face true north — sits square on screen. Degrees clockwise.
const DEFAULT_CAL = {
  lat: 52.185833, lng: 0.141944, widthM: 6, rotationDeg: 0, opacity: 0.95, mapHeading: 0, mapScale: 1,
  // The default view the map OPENS at — centred on the floorplan and zoomed out enough
  // to frame the whole (very tall) long plan, so it's visible before you recalibrate.
  viewLat: 52.185833, viewLng: 0.141944, viewZoom: 19,
};
function loadCal() {
  try { const v = JSON.parse(localStorage.getItem(FLOORPLAN_CAL_KEY)); if (v && Number.isFinite(v.lat)) return { ...DEFAULT_CAL, ...v }; } catch { /* ignore */ }
  return DEFAULT_CAL;
}

// Metres-per-pixel at the follow zoom (reference). We render footprints at a FIXED
// on-screen pixel size and place them at a FIXED on-screen spacing at EVERY zoom —
// so the trail looks identical (same size, gaps, gait) whether zoomed in or out,
// rather than shrinking. Achieved by scaling the real-world spacing with zoom.
const MPP_REF = (156543.03392 * Math.cos((DEFAULT_CENTER.lat * Math.PI) / 180)) / (2 ** FOLLOW_ZOOM);
const FOOT_PX = Math.max(8, FOOT_REAL_M / MPP_REF);   // constant on-screen foot size

// A shoe print = a big sole/ball oval + a small heel oval, pointing "up" (toward
// −y = north at rotation 0); Google Maps rotates it clockwise by the travel
// bearing. Left / right feet mirror the heel to opposite sides so a walking gait
// reads as alternating prints.
const FOOT_SOLE = 'M0,-6.5 C2.6,-6.5 3.2,-3 2.6,-0.3 C2.1,1.8 -2.1,1.8 -2.6,-0.3 C-3.2,-3 -2.6,-6.5 0,-6.5 Z';
// Heel: mostly-flat top facing the forefoot with softly-rounded corners, rounded
// at the bottom (≈20% larger than the plain oval).
const FOOT_R = `${FOOT_SOLE} M0.1,2.1 L1.7,2.1 C2.3,2.1 2.55,2.4 2.55,3 C2.55,4.4 2.1,5.7 0.9,5.8 C-0.3,5.7 -0.75,4.4 -0.75,3 C-0.75,2.4 -0.5,2.1 0.1,2.1 Z`;
const FOOT_L = `${FOOT_SOLE} M-0.1,2.1 L-1.7,2.1 C-2.3,2.1 -2.55,2.4 -2.55,3 C-2.55,4.4 -2.1,5.7 -0.9,5.8 C0.3,5.7 0.75,4.4 0.75,3 C0.75,2.4 0.5,2.1 -0.1,2.1 Z`;

// Cat paw print (same box + size as the foot): a big pad + four toe beans, pointing
// "up" along the direction of travel. Symmetric, so left/right paws use one shape.
const CAT_PAW = [
  'M-2.3,1.9 a2.3,2.3 0 1,0 4.6,0 a2.3,2.3 0 1,0 -4.6,0 Z',      // pad
  'M-3.55,-0.7 a0.95,0.95 0 1,0 1.9,0 a0.95,0.95 0 1,0 -1.9,0 Z', // toe far-left
  'M-1.95,-2.7 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0 Z',                 // toe mid-left
  'M-0.05,-2.7 a1,1 0 1,0 2,0 a1,1 0 1,0 -2,0 Z',                 // toe mid-right
  'M1.65,-0.7 a0.95,0.95 0 1,0 1.9,0 a0.95,0.95 0 1,0 -1.9,0 Z',  // toe far-right
].join(' ');

// STABLE reference — passing an inline arrow here makes OverlayViewF tear down and
// re-mount the DOM on every render, which restarted the fade-in on the whole trail
// each time a new print dropped (the flicker). One shared function = no remounts.
const CENTER_OFFSET = (w, h) => ({ x: -(w / 2), y: -(h / 2) });

// One footprint, memoised on primitive props. The lat/lng passed in are the DISPLAY
// position (scaled so the trail looks identical at every zoom — see the render). At
// the follow zoom the display position equals the real position, so adding a print
// leaves every existing print's props unchanged → React skips them → no remount, no
// fade restart. Each print fades in exactly once. Slick.
const Footprint = memo(function Footprint({ lat, lng, angle, side, t, kind, applyFade }) {
  const d = kind === 'paw' ? CAT_PAW : (side < 0 ? FOOT_L : FOOT_R);
  return (
    <OverlayViewF
      position={{ lat, lng }}
      mapPaneName="overlayLayer"
      getPixelPositionOffset={CENTER_OFFSET}
    >
      {/* Outer div = quick fade-IN; inner div = long fade-OUT. Nesting multiplies
          the opacities so both are smooth and don't fight. */}
      <div style={{ width: FOOT_PX * 0.55, height: FOOT_PX, transform: `rotate(${angle}deg)`, pointerEvents: 'none', animation: 'mmFootIn 1000ms ease-out both' }}>
        <div ref={(el) => applyFade(el, t)} style={{ width: '100%', height: '100%' }}>
          <svg viewBox="-3.6 -7 7.2 13.2" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
            <path d={d} fill={ROUTE} />
          </svg>
        </div>
      </div>
    </OverlayViewF>
  );
});

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function haversineM(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Bearing a→b, degrees clockwise from north.
function bearingDeg(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
    - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
// Deterministic ±JITTER from a position, so a print's angle is stable between
// polls (seeding by index would make them wobble as the trail shifts).
function jitterFor(lat, lng) {
  const h = Math.imul(((Math.round(lat * 1e5) ^ Math.round(lng * 1e5)) >>> 0), 2654435761) >>> 0;
  return ((h % 3001) / 3000) * 2 * JITTER_DEG - JITTER_DEG;
}


// Move a point `distM` metres along `bearing` (degrees) — used by the simulator.
function moveLatLng(lat, lng, distM, bearing) {
  const R = 6371000;
  const br = toRad(bearing); const dr = distM / R;
  const la1 = toRad(lat); const lo1 = toRad(lng);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(dr) + Math.cos(la1) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la1), Math.cos(dr) - Math.sin(la1) * Math.sin(la2));
  return { lat: toDeg(la2), lng: toDeg(lo2) };
}

// ── Floorplan collision (shared by the simulator AND real GPS) ────────────────
// A wall mask is the floorplan SVG rasterised to SVG_W×SVG_H, 1 = wall (drawn),
// 0 = walkable (transparent room / doorway). `cal` gives the georeferencing.
const CONSTRAIN_REAL_TO_HOUSE = true;   // snap real GPS prints into the house + off walls
const HOUSE_GATE_M = 25;                // only constrain GPS pings within 25 m of the house (else it's outdoors)

// Grow a 1=wall mask by `r` pixels (separable box dilation) — a cheap safe-zone so the
// walker keeps a small margin off every wall. Two O(W·H·r) passes, run once on load.
function dilateMask(mask, W, H, r) {
  if (!r || r <= 0) return mask;
  const tmp = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    for (let x = 0; x < W; x += 1) {
      let v = 0;
      for (let dx = -r; dx <= r; dx += 1) { const nx = x + dx; if (nx >= 0 && nx < W && mask[row + nx]) { v = 1; break; } }
      tmp[row + x] = v;
    }
  }
  const out = new Uint8Array(W * H);
  for (let x = 0; x < W; x += 1) {
    for (let y = 0; y < H; y += 1) {
      let v = 0;
      for (let dy = -r; dy <= r; dy += 1) { const ny = y + dy; if (ny >= 0 && ny < H && tmp[ny * W + x]) { v = 1; break; } }
      out[y * W + x] = v;
    }
  }
  return out;
}

function latLngToSvg(lat, lng, cal) {
  const halfW = (Number(cal.widthM) || 6) / 2;
  const halfH = ((Number(cal.widthM) || 6) * FLOORPLAN_ASPECT) / 2;
  const rr = ((cal.rotationDeg || 0) * Math.PI) / 180;
  const dN = (lat - cal.lat) * 111320;
  const dE = (lng - cal.lng) * 111320 * Math.cos((cal.lat * Math.PI) / 180);
  const lx = dE * Math.cos(rr) - dN * Math.sin(rr);
  const ly = -dE * Math.sin(rr) - dN * Math.cos(rr);
  return { sx: ((lx + halfW) / (2 * halfW)) * SVG_W, sy: ((ly + halfH) / (2 * halfH)) * SVG_H };
}
function svgToLatLng(sx, sy, cal) {
  const halfW = (Number(cal.widthM) || 6) / 2;
  const halfH = ((Number(cal.widthM) || 6) * FLOORPLAN_ASPECT) / 2;
  const rr = ((cal.rotationDeg || 0) * Math.PI) / 180;
  const lx = (sx / SVG_W) * 2 * halfW - halfW;
  const ly = (sy / SVG_H) * 2 * halfH - halfH;
  const dE = lx * Math.cos(rr) - ly * Math.sin(rr);      // R is its own inverse (reflection)
  const dN = -lx * Math.sin(rr) - ly * Math.cos(rr);
  return { lat: cal.lat + dN / 111320, lng: cal.lng + dE / (111320 * Math.cos((cal.lat * Math.PI) / 180)) };
}
function isWallAt(mask, sx, sy) {
  const x = Math.round(sx); const y = Math.round(sy);
  if (x < 0 || y < 0 || x >= SVG_W || y >= SVG_H) return true;   // outside the plan = blocked
  return mask ? mask[y * SVG_W + x] === 1 : false;               // no mask → only the rectangle bounds
}
// Does the straight line a→b cross a wall (sampled in SVG space)?
function pathHitsWall(aLat, aLng, bLat, bLng, cal, mask) {
  const a = latLngToSvg(aLat, aLng, cal); const b = latLngToSvg(bLat, bLng, cal);
  const n = Math.max(2, Math.ceil(Math.hypot(b.sx - a.sx, b.sy - a.sy)));
  for (let i = 1; i <= n; i += 1) { const t = i / n; if (isWallAt(mask, a.sx + (b.sx - a.sx) * t, a.sy + (b.sy - a.sy) * t)) return true; }
  return false;
}
// Nearest walkable pixel to (sx,sy) within maxR (spiral). Clamps into bounds first.
function nearestWalkable(mask, sx, sy, maxR) {
  let x = Math.max(0, Math.min(SVG_W - 1, Math.round(sx)));
  let y = Math.max(0, Math.min(SVG_H - 1, Math.round(sy)));
  if (!mask || mask[y * SVG_W + x] === 0) return { sx: x, sy: y };
  for (let r = 1; r <= maxR; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;   // ring only
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= SVG_W || ny >= SVG_H) continue;
        if (mask[ny * SVG_W + nx] === 0) return { sx: nx, sy: ny };
      }
    }
  }
  return null;
}
// Snap a real GPS (lat,lng) into the house: leave it alone if it's clearly outdoors,
// otherwise clamp into the SVG bounds and off any wall into the nearest room.
function constrainToHouse(lat, lng, cal, mask) {
  const dN = (lat - cal.lat) * 111320;
  const dE = (lng - cal.lng) * 111320 * Math.cos((cal.lat * Math.PI) / 180);
  if (Math.hypot(dE, dN) > HOUSE_GATE_M) return { lat, lng };     // far from the house — real outdoor GPS
  const { sx, sy } = latLngToSvg(lat, lng, cal);
  const w = nearestWalkable(mask, sx, sy, 90);
  return w ? svgToLatLng(w.sx, w.sy, cal) : { lat, lng };
}

// Turn a walker's path (pings) into evenly-spaced, direction-pointing prints, L/R,
// dropping any that would sit on a wall. Shared by BOTH David's trail and the cat's.
// Mutates `acc` (the resampling cursor) and `feetRef.current`; returns whether it
// changed so the caller can re-render.
function ingestTrail(sourcePings, acc, feetRef, opts) {
  const { spacing, offset, fadeMs, cap, constrain, cal, mask } = opts;
  let prev = acc.last; let changed = false;
  for (const rawPt of (sourcePings || [])) {
    if (rawPt.t <= acc.lastT) continue;
    const pt = constrain ? { ...rawPt, ...constrainToHouse(rawPt.lat, rawPt.lng, cal, mask) } : rawPt;
    if (!prev) { prev = pt; acc.lastT = pt.t; acc.residual = 0; continue; }
    const segLen = haversineM(prev, pt);
    const wallBetween = constrain && mask && pathHitsWall(prev.lat, prev.lng, pt.lat, pt.lng, cal, mask);
    if (segLen > 0 && !wallBetween) {
      const bearing = bearingDeg(prev, pt);
      let along = spacing - acc.residual;
      while (along <= segLen + 1e-6) {
        const f = along / segLen;
        const lat = prev.lat + (pt.lat - prev.lat) * f;
        const lng = prev.lng + (pt.lng - prev.lng) * f;
        const side = acc.step % 2 === 0 ? -1 : 1;
        let o = moveLatLng(lat, lng, offset, bearing + 90 * side);
        if (constrain && mask) {
          const sp = latLngToSvg(o.lat, o.lng, cal);
          const w = nearestWalkable(mask, sp.sx, sp.sy, 18);
          if (w) o = svgToLatLng(w.sx, w.sy, cal);
        }
        feetRef.current.push({ id: acc.step, lat: o.lat, lng: o.lng, angle: bearing + jitterFor(lat, lng), side, t: pt.t });
        acc.step += 1; along += spacing; changed = true;
      }
      acc.residual = segLen - (along - spacing);
    } else if (wallBetween) {
      acc.residual = 0;   // don't carry the stride across a wall
    }
    prev = pt; acc.lastT = pt.t;
  }
  acc.last = prev;
  const cutoff = Date.now() - fadeMs;
  const before = feetRef.current.length;
  feetRef.current = feetRef.current.filter((ff) => ff.t >= cutoff);
  if (feetRef.current.length > cap) feetRef.current = feetRef.current.slice(-cap);
  return changed || feetRef.current.length !== before;
}

// Advance a simulated walker one wall-respecting step (prefers straight on; retries
// other headings through doorway gaps). Returns whether it moved.
function stepWalker(st, stride, cal, mask) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const h = attempt === 0 ? st.heading + (Math.random() - 0.5) * 20 : Math.random() * 360;
    const p = moveLatLng(st.lat, st.lng, stride, h);
    if (!pathHitsWall(st.lat, st.lng, p.lat, p.lng, cal, mask)) { st.lat = p.lat; st.lng = p.lng; st.heading = h; return true; }
  }
  st.heading = (st.heading + 150 + Math.random() * 60) % 360;   // boxed in — turn, skip this tick
  return false;
}

export default function FootprintsPage() {
  const { user } = useAuth();
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [trail, setTrail] = useState({ pings: [], settings: null });
  const [fpSettings, setFpSettings] = useState(null);   // per-mode config (same source as admin)
  const mapRef = useRef(null);
  const textureRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
    try { textureRef.current?.setMap(null); } catch { /* ignore */ }
  }, []);
  // Live phone-GPS tracking is started/stopped from the Admin → Marauder's Map
  // section now, so it keeps running as David moves between pages.

  // House floorplan overlay + its live calibration (drag/rotate/scale on the map).
  const [cal, setCal] = useState(loadCal);
  const [calibrating, setCalibrating] = useState(false);
  // Whether the on-map "Calibrate floorplan" button shows — toggled from Admin.
  const [showCalibrator, setShowCalibrator] = useState(isCalibratorShown);
  useEffect(() => subscribeCalibrator(setShowCalibrator), []);
  const calRef = useRef(cal); calRef.current = cal;
  const floorplanRef = useRef(null);
  // The calibration is shared via the backend so it's the SAME on every device
  // (desktop, iOS). We seed from localStorage for a fast first paint, then overwrite
  // with the server copy on mount, and push admin edits back up (debounced).
  const calSyncedRef = useRef(false);
  const calSaveTimer = useRef(null);
  useEffect(() => {
    let cancelled = false;
    const hadLocal = (() => { try { return !!localStorage.getItem(FLOORPLAN_CAL_KEY); } catch { return false; } })();
    api.footprints.floorplan()
      .then((cfg) => {
        if (cancelled) return;
        if (cfg && typeof cfg.showCalibrator === 'boolean') setCalibratorShown(cfg.showCalibrator);   // shared button visibility
        if (cfg && Number.isFinite(Number(cfg.lat))) {
          const { showCalibrator, ...calFields } = cfg;                  // keep the UI flag out of the cal object
          setCal((c) => ({ ...c, ...calFields }));                       // server has it → every device uses it
        } else if (hadLocal) {
          api.footprints.saveFloorplan(calRef.current).catch(() => {});  // server empty → seed it from this device's saved calibration
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) calSyncedRef.current = true; });   // allow further saves only after the server load
    return () => { cancelled = true; if (calSaveTimer.current) clearTimeout(calSaveTimer.current); };
  }, []);
  useEffect(() => {
    floorplanRef.current?.update(cal);
    try { localStorage.setItem(FLOORPLAN_CAL_KEY, JSON.stringify(cal)); } catch { /* ignore */ }
    if (calSyncedRef.current) {   // debounce-persist to the backend (admin-only endpoint)
      if (calSaveTimer.current) clearTimeout(calSaveTimer.current);
      calSaveTimer.current = setTimeout(() => { api.footprints.saveFloorplan(cal).catch(() => {}); }, 700);
    }
  }, [cal]);
  useEffect(() => { floorplanRef.current?.setInteractive(calibrating); }, [calibrating]);
  useEffect(() => () => { floorplanRef.current?.destroy(); }, []);
  const goToHouse = useCallback(() => {
    const m = mapRef.current; const c = calRef.current;
    if (m) { m.setZoom(c.viewZoom ?? DEFAULT_ZOOM); m.setCenter({ lat: c.lat, lng: c.lng }); }
  }, []);
  // Capture the map's CURRENT centre + zoom as the default view (persisted).
  const captureView = useCallback(() => {
    const m = mapRef.current; if (!m) return;
    const c = m.getCenter(); if (!c) return;
    setCal((prev) => ({ ...prev, viewLat: c.lat(), viewLng: c.lng(), viewZoom: m.getZoom() }));
  }, []);

  // Web-testing simulator: a fake walk THROUGH Katie's house so the trail can be seen
  // without GPS. The walker respects the floorplan — it can't cross a wall (a drawn
  // line in the SVG) but passes freely through doorway gaps (transparent), one print
  // per step. See startSim.
  const [sim, setSim] = useState(false);
  const [simPings, setSimPings] = useState([]);
  const simRef = useRef(null);
  const [catSimPings, setCatSimPings] = useState([]);   // the cat's simulated walk
  const catSimRef = useRef(null);
  useEffect(() => () => {
    if (simRef.current?.timer) clearInterval(simRef.current.timer);
    if (catSimRef.current?.timer) clearInterval(catSimRef.current.timer);
  }, []);

  // Rasterise the floorplan SVG once into a WALL MASK: a drawn (opaque) pixel = wall,
  // a transparent pixel = walkable room / doorway. The simulator tests candidate steps
  // against this so footprints never walk through walls. Built from the same-origin SVG
  // (with an injected width/height so it rasterises at a known size, untainted).
  const wallMaskRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svgText = await (await fetch(FLOORPLAN_URL)).text();
        const sized = svgText.replace('<svg', `<svg width="${SVG_W}" height="${SVG_H}"`);
        const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
        const img = new Image();
        img.onload = () => {
          if (cancelled) { URL.revokeObjectURL(url); return; }
          const cv = document.createElement('canvas'); cv.width = SVG_W; cv.height = SVG_H;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, SVG_W, SVG_H);
          const px = ctx.getImageData(0, 0, SVG_W, SVG_H).data;
          const mask = new Uint8Array(SVG_W * SVG_H);
          for (let i = 0; i < mask.length; i += 1) mask[i] = px[i * 4 + 3] > 40 ? 1 : 0;
          // Grow the walls by a small SAFE-ZONE buffer so footprints keep a little
          // margin off every line rather than skimming right against it.
          wallMaskRef.current = dilateMask(mask, SVG_W, SVG_H, WALL_BUFFER_PX);
          URL.revokeObjectURL(url);
        };
        img.onerror = () => URL.revokeObjectURL(url);
        img.src = url;
      } catch { /* no mask → walker just stays within the SVG rectangle */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll the broadcaster's trail; a local clock fades the prints between polls.
  useEffect(() => {
    const tick = () => api.footprints.trail(MODE)
      .then((r) => { if (mountedRef.current) setTrail({ pings: r.pings || [], settings: r.settings || null }); })
      .catch(() => {});
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  // Load the per-mode config from the SAME endpoint the admin writes to, so admin
  // edits (spacing / fade / trail length) actually reach the map. Polled so changes
  // show within a few seconds.
  const loadSettings = useCallback(() => api.footprints.settings()
    .then((s) => { if (mountedRef.current) setFpSettings(s); })
    .catch(() => {}), []);
  useEffect(() => {
    loadSettings();
    const id = setInterval(loadSettings, 4000);
    return () => clearInterval(id);
  }, [loadSettings]);

  // Outdoor (phone GPS) is the only mode now.
  const settings = fpSettings?.outdoor || {};
  const fadeMs = Math.max(1000, (Number(settings.fade_seconds) || 900) * 1000);

  // Footprints are placed ONCE at fixed REAL positions as the walker advances, and
  // never recomputed — so the trail doesn't crawl/jitter each update. Old prints drop
  // by age; `id` is a stable key so markers update in place rather than remounting.
  // (The zoom-invariant SCALING happens at render time, not here.)
  const sourcePings = sim ? simPings : trail.pings;
  const [feet, setFeet] = useState([]);
  const feetRef = useRef([]);
  const accRef = useRef({ last: null, residual: 0, step: 0, lastT: 0 });

  // The CAT trail — a second walker (paw prints), simulated alongside David for now.
  // No backend cat source yet, so it's sim-only until the cat is UWB-tagged.
  const catSourcePings = sim ? catSimPings : [];
  const [catFeet, setCatFeet] = useState([]);
  const catFeetRef = useRef([]);
  const catAccRef = useRef({ last: null, residual: 0, step: 0, lastT: 0 });

  // Reset + re-lay BOTH trails when the source flips (sim on/off) or the spacing
  // changes in admin, so a new spacing takes effect at once (not just future prints).
  useEffect(() => {
    accRef.current = { last: null, residual: 0, step: 0, lastT: 0 };
    feetRef.current = []; setFeet([]);
    catAccRef.current = { last: null, residual: 0, step: 0, lastT: 0 };
    catFeetRef.current = []; setCatFeet([]);
  }, [sim, settings.spacing_m]);

  // Ingest David's path → shoe prints. Sim uses a tight house-scale stride; real GPS
  // uses the admin spacing and is snapped into the house / off walls.
  useEffect(() => {
    const spacing = sim ? SIM_SPACING_M : Math.max(0.2, Number(settings.spacing_m) || 0.75);
    const cap = sim ? 400 : Math.max(1, Number(settings.trail_length) || 100);
    const changed = ingestTrail(sourcePings, accRef.current, feetRef, {
      spacing, offset: spacing * 0.3, fadeMs, cap,
      constrain: CONSTRAIN_REAL_TO_HOUSE && !sim, cal: calRef.current, mask: wallMaskRef.current,
    });
    if (changed) setFeet(feetRef.current.slice());
  }, [sim, sourcePings, settings.spacing_m, settings.trail_length, fadeMs]);

  // Ingest the cat's path → paw prints (sim path is already wall-valid, so no snapping).
  useEffect(() => {
    const changed = ingestTrail(catSourcePings, catAccRef.current, catFeetRef, {
      spacing: SIM_SPACING_M, offset: SIM_SPACING_M * 0.3, fadeMs, cap: 400,
      constrain: false, cal: calRef.current, mask: wallMaskRef.current,
    });
    if (changed) setCatFeet(catFeetRef.current.slice());
  }, [sim, catSourcePings, fadeMs]);

  // Disable pull-to-refresh while the full-screen map is up.
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = { h: html.style.overscrollBehavior, bo: body.style.overscrollBehavior, ov: body.style.overflow };
    html.style.overscrollBehavior = 'none'; body.style.overscrollBehavior = 'none'; body.style.overflow = 'hidden';
    // Let the map pan AND let the calibration controls (sliders) receive touchmove —
    // otherwise on iOS the preventDefault here kills the range-slider drag.
    const blockPull = (e) => { const t = e.target; if (t && t.closest && t.closest('.gm-style, [data-mm-controls]')) return; e.preventDefault(); };
    document.addEventListener('touchmove', blockPull, { passive: false });
    return () => {
      html.style.overscrollBehavior = prev.h; body.style.overscrollBehavior = prev.bo; body.style.overflow = prev.ov;
      document.removeEventListener('touchmove', blockPull, { passive: false });
    };
  }, []);

  const onLoad = useCallback((m) => {
    mapRef.current = m;
    // Open at the saved default view (set live from the calibrator), as zoomed as
    // the map allows — Google clamps the zoom to its true max for this area.
    const v = calRef.current;
    m.setCenter({ lat: v.viewLat ?? DEFAULT_CENTER.lat, lng: v.viewLng ?? DEFAULT_CENTER.lng });
    m.setZoom(v.viewZoom ?? DEFAULT_ZOOM);

    // House floorplan overlay (mapPane = below the footprints, so the trail runs on
    // top of the house). Dragging while calibrating moves it up to the event pane.
    if (window.google && !floorplanRef.current) {
      floorplanRef.current = createFloorplanOverlay(m, {
        svgUrl: FLOORPLAN_URL, aspect: FLOORPLAN_ASPECT, initial: calRef.current,
        onChange: (c) => setCal(c),
      });
    }

    // Parchment texture laid over the map at 40%, in the markerLayer pane — above the
    // footprints (overlayLayer) and the floorplan (mapPane), so it tints the whole lot.
    if (window.google && !textureRef.current) {
      const ov = new window.google.maps.OverlayView();
      let div = null;
      ov.onAdd = function onAdd() {
        div = document.createElement('div');
        Object.assign(div.style, {
          position: 'absolute', pointerEvents: 'none',
          backgroundImage: `url("${TEXTURE_URL}")`, backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: String(TEXTURE_OPACITY), filter: `saturate(${TEXTURE_SATURATION})`,
        });
        this.getPanes().markerLayer.appendChild(div);
      };
      ov.draw = function draw() {
        const proj = this.getProjection(); const b = m.getBounds();
        if (!proj || !b || !div) return;
        const ne = proj.fromLatLngToDivPixel(b.getNorthEast());
        const sw = proj.fromLatLngToDivPixel(b.getSouthWest());
        const left = Math.min(sw.x, ne.x); const top = Math.min(ne.y, sw.y);
        const w = Math.abs(ne.x - sw.x); const h = Math.abs(sw.y - ne.y);
        const mg = 0.25;   // extra margin so no edge shows while panning
        div.style.left = `${left - w * mg}px`; div.style.top = `${top - h * mg}px`;
        div.style.width = `${w * (1 + 2 * mg)}px`; div.style.height = `${h * (1 + 2 * mg)}px`;
      };
      ov.onRemove = function onRemove() { if (div) { div.remove(); div = null; } };
      ov.setMap(m);
      textureRef.current = ov;
    }
  }, []);

  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
    disableDefaultUI: true, keyboardShortcuts: false, gestureHandling: 'greedy',
    styles: MARAUDERS_STYLE, backgroundColor: PARCHMENT, clickableIcons: false,
  }), []);
  // Each footprint fades out via a pure CSS animation (GPU, 60fps — buttery), set
  // ONCE when its element mounts. A negative delay = its current age, so a print
  // that's already half-faded starts half-faded and continues smoothly. Read fadeMs
  // from a ref so the callback stays stable (re-renders never restart the fade).
  const fadeMsRef = useRef(fadeMs);
  fadeMsRef.current = fadeMs;
  const applyFade = useCallback((el, t) => {
    if (!el || el.dataset.mmf) return;
    el.dataset.mmf = '1';
    const age = Math.max(0, Date.now() - t);
    el.style.animation = `mmFootFade ${fadeMsRef.current + 500}ms linear both`;
    el.style.animationDelay = `-${age}ms`;
  }, []);

  // Simulator: walk David AND the cat THROUGH the house — one tight print per tick each,
  // respecting the walls (retrying headings to slip through doorway gaps). Each starts
  // at an SVG spot, snapped into the nearest walkable room.
  const startWalker = useCallback((svgX, svgY, setPings, ref) => {
    const wp = nearestWalkable(wallMaskRef.current, svgX, svgY, 300) || { sx: svgX, sy: svgY };
    const start = svgToLatLng(wp.sx, wp.sy, calRef.current);
    const s = { lat: start.lat, lng: start.lng, heading: Math.random() * 360, timer: null };
    ref.current = s;
    setPings([{ lat: s.lat, lng: s.lng, t: Date.now() }]);
    s.timer = setInterval(() => {
      const st = ref.current; if (!st) return;
      if (!stepWalker(st, SIM_SPACING_M, calRef.current, wallMaskRef.current)) return;
      const tnow = Date.now();
      setPings((prev) => [...prev, { lat: st.lat, lng: st.lng, t: tnow }].filter((pp) => pp.t >= tnow - fadeMs));
    }, 1050);
  }, [fadeMs]);

  const startSim = useCallback(() => {
    loadSettings();
    // David in the bottom third; the cat starts NEARBY (a little to the side and up).
    startWalker(SVG_W / 2, (SVG_H * 5) / 6, setSimPings, simRef);
    startWalker(SVG_W * 0.32, (SVG_H * 5) / 6 - SVG_H * 0.045, setCatSimPings, catSimRef);
    setSim(true);
  }, [loadSettings, startWalker]);

  const stopSim = useCallback(() => {
    if (simRef.current?.timer) clearInterval(simRef.current.timer);
    if (catSimRef.current?.timer) clearInterval(catSimRef.current.timer);
    simRef.current = null; catSimRef.current = null;
    setSimPings([]); setCatSimPings([]);
    setSim(false);
  }, []);

  // The simulator is toggled from Admin → Marauder's Map. Mirror that flag here:
  // start/stop the walk to match, and auto-start if it's already on when the map opens.
  useEffect(() => {
    const apply = (v) => {
      const running = !!simRef.current;
      if (v && !running) startSim();
      else if (!v && running) stopSim();
    };
    apply(isSimOn());
    return subscribeSim(apply);
  }, [startSim, stopSim]);

  // Admin-only for now (David's private testing build; Katie kept out until ready).
  if (!(user?.actual_role === 'admin' || user?.role === 'admin')) {
    return <Navigate to="/" replace />;
  }

  // Only wrap the map in a transformed container when a rotation is actually set —
  // a CSS-transformed ancestor can upset Google Maps' tile rendering, so with no
  // rotation (the usual case) the map sits in a plain container and renders cleanly.
  const rot = cal.mapHeading || 0;
  const scale = Math.max(1, cal.mapScale || 1);   // extra CSS zoom BEYOND Google's max (base map is just parchment there)
  // When rotated/scaled we use a big CENTRED SQUARE (side ≥ the viewport diagonal) so ANY
  // angle 0–360° stays fully covered with no empty corners.
  const transformed = rot !== 0 || scale !== 1;
  const mapWrapStyle = transformed
    ? { position: 'absolute', top: '50%', left: '50%', width: '160vmax', height: '160vmax', transformOrigin: 'center center', transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})` }
    : { position: 'absolute', inset: 0 };

  return (
    <div data-no-ptr style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: PARCHMENT, overscrollBehavior: 'none' }}>
      <style>{'@keyframes mmFootFade{from{opacity:1}to{opacity:0}}@keyframes mmFootIn{from{opacity:0}to{opacity:1}}'}</style>
      {isLoaded && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* When rotated, the wrapper is oversized (180%) so the turn never reveals
              empty corners; the CSS rotation turns the whole map — roads, floorplan
              and footprints as one — so Katie's not-quite-north house sits square. */}
          <div style={mapWrapStyle}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: transformed ? '100%' : 'calc(100% + 34px)' }}
            onLoad={onLoad}
            options={mapOptions}
          >
            {/* Prints render at their REAL positions (pinned to the map / floorplan),
                so adding a new one never disturbs the others — one fades in, the old
                ones stay put and fade out. Smooth and identical at every zoom. */}
            {feet.map((p) => (
              <Footprint key={`d${p.id}`} lat={p.lat} lng={p.lng} angle={p.angle} side={p.side} t={p.t} applyFade={applyFade} />
            ))}
            {catFeet.map((p) => (
              <Footprint key={`c${p.id}`} lat={p.lat} lng={p.lng} angle={p.angle} side={p.side} t={p.t} kind="paw" applyFade={applyFade} />
            ))}
          </GoogleMap>
          </div>
        </div>
      )}

      {/* Marauder's banner across the top (transparent PNG, sits over the map). */}
      <img
        src="/marauders_banner.png"
        alt="The Marauder's Map"
        draggable={false}
        style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          width: 'min(90%, 440px)', height: 'auto', pointerEvents: 'none',
          filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
          animation: 'mmFootIn 2s ease-out 2s both',
        }}
      />

      {/* Floorplan calibrator — its visibility is toggled from Admin → Marauder's Map. */}
      {showCalibrator && (
        <FloorplanControls
          cal={cal}
          setCal={setCal}
          calibrating={calibrating}
          setCalibrating={setCalibrating}
          onGoToHouse={goToHouse}
          onCaptureView={captureView}
        />
      )}
    </div>
  );
}
