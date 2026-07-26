import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleMap, OverlayViewF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { MARAUDERS_STYLE, PARCHMENT, ROUTE, inUK } from '../lib/marauderMapStyle.js';

/*
 * "Marauder's Map" — a fading trail of footprints tracing where the broadcaster
 * (David) has been. Footprints are resampled from the raw GPS path at a manual
 * `spacing_m`, each one pointing along the direction of travel with a random ±15°
 * angle for that hand-inked authenticity, and fading out over `fade_seconds`.
 *
 * v1 = outdoor GPS, David-only (testing). The engine is shared with the coming
 * indoor (UWB) mode; only the `mode` string and its config differ.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const DEFAULT_CENTER = { lat: 52.177306, lng: 0.125833 };
const MODE = 'outdoor';
const JITTER_DEG = 15;          // ±15° hand-drawn wobble
const FOLLOW_ZOOM = 20;         // stay zoomed right in, following the walker
const TEXTURE_URL = '/marauders_texture.jpg?v=2';   // bump ?v when the texture changes (busts cache)
const TEXTURE_OPACITY = 0.4;    // aged-parchment texture laid over the map
const TEXTURE_SATURATION = 1.6; // boost the texture's colour
const FOOT_REAL_M = 0.7;        // footprint length in metres AT THE FOLLOW ZOOM

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
  const [now, setNow] = useState(Date.now());
  const [mapZoom, setMapZoom] = useState(FOLLOW_ZOOM);
  const mapRef = useRef(null);
  const textureRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
    try { textureRef.current?.setMap(null); } catch { /* ignore */ }
  }, []);
  // Web-testing simulator: a fake walking trail so you can see the look without GPS.
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
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // Only drives the "X min ago" label now (the fade is pure CSS), so a lazy tick.
    const id = setInterval(() => setNow(Date.now()), 15000);
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

  // Simulation is EXTERNAL (outdoor) only — it always uses the outdoor config.
  const settings = fpSettings?.outdoor || {};
  const fadeMs = Math.max(1000, (Number(settings.fade_seconds) || 900) * 1000);
  // How much to scale real-world spacing so on-screen spacing stays constant across
  // zooms (2× per zoom level out). Quantised to whole zoom levels so it only re-lays
  // when you cross a level, not during a pinch.
  const zoomK = 2 ** (FOLLOW_ZOOM - Math.round(mapZoom));

  // Footprints are placed ONCE at fixed positions as the walker advances, and never
  // recomputed — so the trail doesn't crawl/jitter each update (which is what made
  // it feel like a bad GIF). Old prints drop by age; `id` is a stable key so markers
  // update in place (smooth) rather than remounting.
  const sourcePings = sim ? simPings : trail.pings;
  const [feet, setFeet] = useState([]);
  const feetRef = useRef([]);
  const accRef = useRef({ last: null, residual: 0, step: 0, lastT: 0 });

  // Reset + re-lay the trail when the source flips (sim on/off) OR the spacing
  // changes in admin, so a new spacing takes effect at once (not just future prints).
  useEffect(() => {
    accRef.current = { last: null, residual: 0, step: 0, lastT: 0 };
    feetRef.current = []; setFeet([]);
  }, [sim, settings.spacing_m, zoomK]);

  // Ingest any NEW path points → drop footprints every (zoom-scaled) spacing, L/R.
  useEffect(() => {
    const spacing = Math.max(0.2, (Number(settings.spacing_m) || 0.75) * zoomK);
    const offset = spacing * 0.4;   // scales with spacing → constant on-screen offset
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
  }, [sourcePings, settings.spacing_m, settings.trail_length, fadeMs, zoomK]);

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

  // Centre ONCE on the latest footprint when the page (or a fresh simulation) first
  // has a trail, then leave the map alone — no per-step re-centering. The user pans
  // freely; the walker may wander out of view, which is intended.
  const didCenterRef = useRef(false);
  useEffect(() => { didCenterRef.current = false; }, [sim]);   // re-centre once when sim toggles
  useEffect(() => {
    if (!isLoaded || didCenterRef.current || !feet.length) return;
    const m = mapRef.current; const h = feet[feet.length - 1];
    if (m && h && inUK(h)) { m.setZoom(FOLLOW_ZOOM); m.setCenter({ lat: h.lat, lng: h.lng }); didCenterRef.current = true; }
  }, [isLoaded, feet, sim]);

  const onLoad = useCallback((m) => {
    mapRef.current = m;
    m.setCenter(DEFAULT_CENTER); m.setZoom(FOLLOW_ZOOM);
    m.addListener('zoom_changed', () => setMapZoom(m.getZoom()));

    // Parchment texture laid over the map at 40%, in the overlayLayer pane — which
    // sits BELOW the marker pane, so the footprints render on top of the texture.
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
        this.getPanes().overlayLayer.appendChild(div);
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
    center: DEFAULT_CENTER, zoom: FOLLOW_ZOOM,
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
    el.style.animation = `mmFootFade ${fadeMsRef.current}ms linear both`;
    el.style.animationDelay = `-${age}ms`;
  }, []);

  // Simulator: seed a meandering path (timestamps spread across the fade window so
  // you see the fade gradient at once), then keep walking a live head that drops a
  // fresh print every ~1.2s and ages old ones out — the full look, no GPS needed.
  const startSim = useCallback(() => {
    loadSettings();   // use the latest admin config immediately
    const c = mapRef.current?.getCenter?.();
    const center = c ? { lat: c.lat(), lng: c.lng() } : DEFAULT_CENTER;
    const RAW_STEP = 0.9;   // metres between raw path points (≈ one print each)
    const count = 90;       // seed points → a full trail from the off
    const fade = fadeMs;
    let lat = center.lat; let lng = center.lng; let heading = Math.random() * 360;
    const now0 = Date.now();
    const seed = [];
    for (let i = 0; i < count; i += 1) {
      heading += (Math.random() - 0.5) * 22;   // gentle meander
      const p = moveLatLng(lat, lng, RAW_STEP, heading);
      lat = p.lat; lng = p.lng;
      seed.push({ lat, lng, t: now0 - fade * (1 - i / (count - 1)) * 0.9 });
    }
    simRef.current = { lat, lng, heading, timer: null };
    setSimPings(seed);
    // Walk a live head every ~1.1s (≈ walking pace), ageing old prints out.
    simRef.current.timer = setInterval(() => {
      const s = simRef.current; if (!s) return;
      s.heading += (Math.random() - 0.5) * 22;
      const p = moveLatLng(s.lat, s.lng, RAW_STEP, s.heading);
      s.lat = p.lat; s.lng = p.lng;
      const tnow = Date.now();
      setSimPings((prev) => [...prev, { lat: p.lat, lng: p.lng, t: tnow }].filter((pp) => pp.t >= tnow - fade));
    }, 550);
    setSim(true);
  }, [fadeMs, loadSettings]);

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

  const head = feet.length ? feet[feet.length - 1] : null;
  const lastAgeMin = head ? Math.max(0, Math.round((now - head.t) / 60000)) : null;

  return (
    <div style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: PARCHMENT, overscrollBehavior: 'none' }}>
      <style>{'@keyframes mmFootFade{from{opacity:1}to{opacity:0}}@keyframes mmFootIn{from{opacity:0}to{opacity:1}}'}</style>
      {isLoaded && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: 'calc(100% + 34px)' }}
            onLoad={onLoad}
            options={mapOptions}
          >
            {feet.map((p) => (
              <OverlayViewF
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                mapPaneName="markerLayer"
                getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
              >
                {/* Outer div = quick fade-IN; inner div = long fade-OUT. Nesting
                    multiplies the opacities so both are smooth and don't fight. */}
                <div
                  style={{ width: FOOT_PX * 0.55, height: FOOT_PX, transform: `rotate(${p.angle}deg)`, pointerEvents: 'none', animation: 'mmFootIn 500ms ease-out both' }}
                >
                  <div ref={(el) => applyFade(el, p.t)} style={{ width: '100%', height: '100%' }}>
                    <svg viewBox="-3.6 -7 7.2 13.2" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
                      <path d={p.side < 0 ? FOOT_L : FOOT_R} fill={ROUTE} />
                    </svg>
                  </div>
                </div>
              </OverlayViewF>
            ))}
          </GoogleMap>
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
          animation: 'mmFootIn 2s ease-out 1s both',
        }}
      />

      {/* Simulate button (web testing) — bottom-centre, above the tracker tile. */}
      <button
        type="button"
        onClick={sim ? stopSim : startSim}
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(max(20px, env(safe-area-inset-bottom)) + 74px)', zIndex: 11,
          border: 'none', borderRadius: 999, padding: '8px 16px', cursor: 'pointer',
          background: sim ? '#2a2a2a' : ROUTE, color: '#fff', fontSize: 13, fontWeight: 700,
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)', WebkitTapHighlightColor: 'transparent',
        }}
      >
        {sim ? 'Stop simulation' : 'Simulate footsteps'}
      </button>

      {/* Minimal status card. */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        background: '#f7db9b', borderRadius: 18, padding: '10px 15px',
        boxShadow: '0 10px 34px rgba(0,0,0,0.4)', color: '#000',
      }}>
        {feet.length === 0 ? (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>No footprints yet</p>
            <p style={{ margin: '3px 0 0', opacity: 0.65, fontSize: 12 }}>
              {settings.enabled ? 'The trail appears once you start moving with tracking on.' : 'Outdoor tracking is turned off.'}
            </p>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              {user?.name || 'David'} <span style={{ opacity: 0.55, fontWeight: 500 }}>· {feet.length} prints</span>
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,0,0,0.55)', whiteSpace: 'nowrap' }}>
              {lastAgeMin === 0 ? 'moving now' : `${lastAgeMin} min ago`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
