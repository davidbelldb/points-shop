import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleMap, OverlayViewF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { MARAUDERS_STYLE, PARCHMENT, ROUTE } from '../lib/marauderMapStyle.js';
import { createFloorplanOverlay } from '../lib/floorplanOverlay.js';
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
const SIM_START = { lat: 52.185869, lng: 0.142019 };  // simulator walks around here (Katie's house)
const SIM_RADIUS_M = 6;         // keep the simulated wander within ~6 m of SIM_START (house-scale, stays framed at max zoom)
const TEXTURE_URL = '/marauders_texture.jpg?v=2';   // bump ?v when the texture changes (busts cache)
const TEXTURE_OPACITY = 0.4;    // aged-parchment texture laid over the map
const TEXTURE_SATURATION = 1.6; // boost the texture's colour
const FOOT_REAL_M = 1.094;      // footprint length in metres AT THE FOLLOW ZOOM (+25% again)

// Katie's house floorplan overlay (blinco_floorplan.svg). ASPECT = viewBox H / W.
// DEFAULT_CAL is the best-guess georeferencing; David tunes it live with the on-map
// calibrator (drag / rotate / scale) and the locked-in numbers get baked in here.
const SHOW_CALIBRATOR = true;   // re-shown so David can dial the map rotation; flip false when set
const FLOORPLAN_URL = '/blinco_floorplan.svg';
const FLOORPLAN_ASPECT = 835.44 / 407.04;
const FLOORPLAN_CAL_KEY = 'blincoFloorplanCal';
// mapHeading rotates the WHOLE map (roads + floorplan + footprints) so Katie's house
// — which doesn't face true north — sits square on screen. Degrees clockwise.
const DEFAULT_CAL = {
  lat: 52.185833, lng: 0.141944, widthM: 6, rotationDeg: 0, opacity: 0.95, mapHeading: 0,
  // The default view the map OPENS at — captured live from the calibrator.
  viewLat: DEFAULT_CENTER.lat, viewLng: DEFAULT_CENTER.lng, viewZoom: DEFAULT_ZOOM,
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

// STABLE reference — passing an inline arrow here makes OverlayViewF tear down and
// re-mount the DOM on every render, which restarted the fade-in on the whole trail
// each time a new print dropped (the flicker). One shared function = no remounts.
const CENTER_OFFSET = (w, h) => ({ x: -(w / 2), y: -(h / 2) });

// One footprint, memoised on primitive props. The lat/lng passed in are the DISPLAY
// position (scaled so the trail looks identical at every zoom — see the render). At
// the follow zoom the display position equals the real position, so adding a print
// leaves every existing print's props unchanged → React skips them → no remount, no
// fade restart. Each print fades in exactly once. Slick.
const Footprint = memo(function Footprint({ lat, lng, angle, side, t, applyFade }) {
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
            <path d={side < 0 ? FOOT_L : FOOT_R} fill={ROUTE} />
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
  const calRef = useRef(cal); calRef.current = cal;
  const floorplanRef = useRef(null);
  useEffect(() => {
    floorplanRef.current?.update(cal);
    try { localStorage.setItem(FLOORPLAN_CAL_KEY, JSON.stringify(cal)); } catch { /* ignore */ }
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

  // Web-testing simulator: a fake walk around Katie's house so the trail can be
  // seen without GPS. Bounded random walk near SIM_START, one print per step.
  const [sim, setSim] = useState(false);
  const [simPings, setSimPings] = useState([]);
  const simRef = useRef(null);
  useEffect(() => () => { if (simRef.current?.timer) clearInterval(simRef.current.timer); }, []);

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

  // Reset + re-lay the trail when the source flips (sim on/off) or the spacing
  // changes in admin, so a new spacing takes effect at once (not just future prints).
  useEffect(() => {
    accRef.current = { last: null, residual: 0, step: 0, lastT: 0 };
    feetRef.current = []; setFeet([]);
  }, [sim, settings.spacing_m]);

  // Ingest any NEW path points → drop footprints every `spacing_m` REAL metres, L/R.
  // Spacing and count are absolute (real-world), NOT scaled by zoom — so the exact
  // same set of prints is pinned to the map at every zoom height. Zoom in or out and
  // the whole trail stays (it just gets nearer/further), instead of thinning out.
  useEffect(() => {
    const spacing = Math.max(0.2, Number(settings.spacing_m) || 0.75);
    const offset = spacing * 0.4;   // L/R stance offset, in real metres
    const acc = accRef.current;
    let prev = acc.last; let changed = false;
    for (const pt of (sourcePings || [])) {
      if (pt.t <= acc.lastT) continue;
      if (!prev) { prev = pt; acc.lastT = pt.t; acc.residual = 0; continue; }
      const segLen = haversineM(prev, pt);
      if (segLen > 0) {
        const bearing = bearingDeg(prev, pt);
        let along = spacing - acc.residual;
        while (along <= segLen + 1e-6) {
          const f = along / segLen;
          const lat = prev.lat + (pt.lat - prev.lat) * f;
          const lng = prev.lng + (pt.lng - prev.lng) * f;
          const side = acc.step % 2 === 0 ? -1 : 1;
          const o = moveLatLng(lat, lng, offset, bearing + 90 * side);
          feetRef.current.push({ id: acc.step, lat: o.lat, lng: o.lng, angle: bearing + jitterFor(lat, lng), side, t: pt.t });
          acc.step += 1; along += spacing; changed = true;
        }
        acc.residual = segLen - (along - spacing);
      }
      prev = pt; acc.lastT = pt.t;
    }
    acc.last = prev;
    const cutoff = Date.now() - fadeMs;
    const cap = Math.max(1, Number(settings.trail_length) || 100);
    const before = feetRef.current.length;
    feetRef.current = feetRef.current.filter((ff) => ff.t >= cutoff);
    if (feetRef.current.length > cap) feetRef.current = feetRef.current.slice(-cap);
    if (changed || feetRef.current.length !== before) setFeet(feetRef.current.slice());
  }, [sourcePings, settings.spacing_m, settings.trail_length, fadeMs]);

  // Disable pull-to-refresh while the full-screen map is up.
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = { h: html.style.overscrollBehavior, bo: body.style.overscrollBehavior, ov: body.style.overflow };
    html.style.overscrollBehavior = 'none'; body.style.overscrollBehavior = 'none'; body.style.overflow = 'hidden';
    const blockPull = (e) => { const t = e.target; if (t && t.closest && t.closest('.gm-style')) return; e.preventDefault(); };
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

  // Simulator: walk around Katie's house (bounded random walk near SIM_START),
  // dropping exactly ONE print per tick (L, R, L, R…). Steers back toward the start
  // whenever it drifts past SIM_RADIUS_M so the trail stays over the floorplan.
  const startSim = useCallback(() => {
    loadSettings();
    const stride = Math.max(0.2, Number(settings.spacing_m) || 0.75);
    const s = { lat: SIM_START.lat, lng: SIM_START.lng, heading: Math.random() * 360, timer: null };
    simRef.current = s;
    setSimPings([{ lat: s.lat, lng: s.lng, t: Date.now() }]);
    const m = mapRef.current;
    if (m) { m.setCenter(SIM_START); }
    s.timer = setInterval(() => {
      const st = simRef.current; if (!st) return;
      const here = { lat: st.lat, lng: st.lng };
      if (haversineM(here, SIM_START) > SIM_RADIUS_M) {
        st.heading = bearingDeg(here, SIM_START) + (Math.random() - 0.5) * 40;   // turn back toward the house
      } else {
        st.heading += (Math.random() - 0.5) * 35;   // gentle meander
      }
      const p = moveLatLng(st.lat, st.lng, stride, st.heading);
      st.lat = p.lat; st.lng = p.lng;
      const tnow = Date.now();
      setSimPings((prev) => [...prev, { lat: p.lat, lng: p.lng, t: tnow }].filter((pp) => pp.t >= tnow - fadeMs));
    }, 1050);
    setSim(true);
  }, [fadeMs, loadSettings, settings.spacing_m]);

  const stopSim = useCallback(() => {
    if (simRef.current?.timer) clearInterval(simRef.current.timer);
    simRef.current = null;
    setSimPings([]);
    setSim(false);
  }, []);

  // Admin-only for now (David's private testing build; Katie kept out until ready).
  if (!(user?.actual_role === 'admin' || user?.role === 'admin')) {
    return <Navigate to="/" replace />;
  }

  // Only wrap the map in a transformed container when a rotation is actually set —
  // a CSS-transformed ancestor can upset Google Maps' tile rendering, so with no
  // rotation (the usual case) the map sits in a plain container and renders cleanly.
  const rot = cal.mapHeading || 0;
  const mapWrapStyle = rot
    ? { position: 'absolute', top: '50%', left: '50%', width: '180%', height: '180%', transformOrigin: 'center center', transform: `translate(-50%, -50%) rotate(${rot}deg)` }
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
            mapContainerStyle={{ width: '100%', height: rot ? '100%' : 'calc(100% + 34px)' }}
            onLoad={onLoad}
            options={mapOptions}
          >
            {/* Prints render at their REAL positions (pinned to the map / floorplan),
                so adding a new one never disturbs the others — one fades in, the old
                ones stay put and fade out. Smooth and identical at every zoom. */}
            {feet.map((p) => (
              <Footprint key={p.id} lat={p.lat} lng={p.lng} angle={p.angle} side={p.side} t={p.t} applyFade={applyFade} />
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

      {/* Simulate footsteps (web testing) — bottom-centre. Walks around the house. */}
      <button
        type="button"
        onClick={sim ? stopSim : startSim}
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 11,
          border: 'none', borderRadius: 999, padding: '10px 20px', cursor: 'pointer',
          background: sim ? '#2a2a2a' : ROUTE, color: '#fff', fontSize: 14, fontWeight: 700,
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)', WebkitTapHighlightColor: 'transparent',
        }}
      >
        {sim ? 'Stop simulation' : 'Simulate footsteps'}
      </button>

      {/* Floorplan calibrator — hidden now the placement is set. Flip SHOW_CALIBRATOR
          to true to re-enable the drag/rotate/scale + default-view controls. */}
      {SHOW_CALIBRATOR && (
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
