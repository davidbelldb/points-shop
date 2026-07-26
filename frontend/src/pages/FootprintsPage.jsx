import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
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
const FIT_PADDING = { top: 71, bottom: 90, left: 56, right: 56 };
const RECENTER_DELAY_MS = 6000;
const JITTER_DEG = 15;          // ±15° hand-drawn wobble
const MIN_OPACITY = 0.06;       // faintest a footprint gets before it's dropped

// A single left-foot sole shape pointing "up" (toward −y = north at rotation 0);
// Google Maps rotates it clockwise by the travel bearing.
const FOOT_PATH = 'M 0,-7 C 3.1,-7 4.1,-2.6 3,1.4 C 2.4,4 -2.4,4 -3,1.4 C -4.1,-2.6 -3.1,-7 0,-7 Z';

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

// Turn the raw path into evenly-spaced, direction-pointing footprints.
function buildFootprints(pings, spacingM, trailLength) {
  if (!Array.isArray(pings) || pings.length < 2) return [];
  const segs = [];
  let cum = 0;
  for (let i = 1; i < pings.length; i += 1) {
    const len = haversineM(pings[i - 1], pings[i]);
    if (len <= 0) continue;
    segs.push({ a: pings[i - 1], b: pings[i], start: cum, len, bearing: bearingDeg(pings[i - 1], pings[i]) });
    cum += len;
  }
  if (!segs.length) return [];
  const total = cum;
  const spacing = Math.max(0.3, Number(spacingM) || 10);
  const prints = [];
  let idx = 0;
  for (let d = 0; d <= total; d += spacing) {
    while (idx < segs.length - 1 && d > segs[idx].start + segs[idx].len) idx += 1;
    const s = segs[idx];
    const f = s.len > 0 ? (d - s.start) / s.len : 0;
    const lat = s.a.lat + (s.b.lat - s.a.lat) * f;
    const lng = s.a.lng + (s.b.lng - s.a.lng) * f;
    const t = s.a.t + (s.b.t - s.a.t) * f;
    prints.push({ lat, lng, t, angle: s.bearing + jitterFor(lat, lng) });
  }
  const cap = Math.max(1, Number(trailLength) || 100);
  return prints.slice(-cap);
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
  const [now, setNow] = useState(Date.now());
  const cam = useMemo(() => ({ center: DEFAULT_CENTER, zoom: 15 }), []);
  const lastInteractRef = useRef(0);
  const programmaticRef = useRef(false);
  const recenterTimerRef = useRef(null);
  const fitPointsRef = useRef([]);
  const mapRef = useRef(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
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
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const settings = trail.settings || {};
  const fadeMs = Math.max(1000, (Number(settings.fade_seconds) || 900) * 1000);

  const footprints = useMemo(() => {
    const src = sim ? simPings : (trail.pings || []);
    return buildFootprints(src, settings.spacing_m, settings.trail_length);
  }, [sim, simPings, trail.pings, settings.spacing_m, settings.trail_length]);

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

  // Keep the fit target = all footprint positions.
  useEffect(() => {
    fitPointsRef.current = footprints.filter(inUK).map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [footprints]);

  const recenter = useCallback(() => {
    const m = mapRef.current; const pts = fitPointsRef.current;
    if (!m || !window.google || !pts.length) return;
    programmaticRef.current = true;
    if (pts.length === 1) { m.setCenter(pts[0]); m.setZoom(17); }
    else {
      const b = new window.google.maps.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      m.fitBounds(b, FIT_PADDING);
    }
    window.setTimeout(() => { programmaticRef.current = false; }, 800);
  }, []);

  const noteInteraction = useCallback(() => {
    lastInteractRef.current = Date.now();
    if (recenterTimerRef.current) clearTimeout(recenterTimerRef.current);
    recenterTimerRef.current = setTimeout(() => {
      if (Date.now() - lastInteractRef.current >= RECENTER_DELAY_MS - 100) recenter();
    }, RECENTER_DELAY_MS);
  }, [recenter]);

  const onLoad = useCallback((m) => {
    mapRef.current = m;
    m.setCenter(DEFAULT_CENTER); m.setZoom(15);
    m.addListener('dragstart', noteInteraction);
    m.addListener('zoom_changed', () => { if (!programmaticRef.current) noteInteraction(); });
  }, [noteInteraction]);

  // Re-frame on each poll (fresh footprints), unless the user is exploring.
  useEffect(() => {
    if (!isLoaded || !footprints.length) return;
    if (Date.now() - lastInteractRef.current < RECENTER_DELAY_MS) return;
    recenter();
  }, [isLoaded, footprints, recenter]);

  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: 15,
    disableDefaultUI: true, keyboardShortcuts: false, gestureHandling: 'greedy',
    styles: MARAUDERS_STYLE, backgroundColor: PARCHMENT, clickableIcons: false,
  }), []);
  const anchor = useMemo(() => (isLoaded ? new window.google.maps.Point(0, 0) : undefined), [isLoaded]);

  // Simulator: seed a meandering path (timestamps spread across the fade window so
  // you see the fade gradient at once), then keep walking a live head that drops a
  // fresh print every ~1.2s and ages old ones out — the full look, no GPS needed.
  const startSim = useCallback(() => {
    const c = mapRef.current?.getCenter?.();
    const center = c ? { lat: c.lat(), lng: c.lng() } : DEFAULT_CENTER;
    const spacing = Math.max(3, Number(settings.spacing_m) || 15);
    const count = Math.min(200, Math.max(24, Number(settings.trail_length) || 120));
    const fade = fadeMs;
    let lat = center.lat; let lng = center.lng; let heading = Math.random() * 360;
    const now0 = Date.now();
    const seed = [];
    for (let i = 0; i < count; i += 1) {
      heading += (Math.random() - 0.5) * 45;
      const p = moveLatLng(lat, lng, spacing, heading);
      lat = p.lat; lng = p.lng;
      seed.push({ lat, lng, t: now0 - fade * (1 - i / (count - 1)) * 0.95 });
    }
    simRef.current = { lat, lng, heading, timer: null };
    setSimPings(seed);
    simRef.current.timer = setInterval(() => {
      const s = simRef.current; if (!s) return;
      s.heading += (Math.random() - 0.5) * 45;
      const p = moveLatLng(s.lat, s.lng, spacing, s.heading);
      s.lat = p.lat; s.lng = p.lng;
      const tnow = Date.now();
      setSimPings((prev) => [...prev, { lat: p.lat, lng: p.lng, t: tnow }].filter((pp) => pp.t >= tnow - fade));
    }, 1200);
    setSim(true);
  }, [settings.spacing_m, settings.trail_length, fadeMs]);

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

  const head = footprints.length ? footprints[footprints.length - 1] : null;
  const lastAgeMin = head ? Math.max(0, Math.round((now - head.t) / 60000)) : null;

  return (
    <div style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: PARCHMENT, overscrollBehavior: 'none' }}>
      {isLoaded && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: 'calc(100% + 34px)' }}
            center={cam.center}
            zoom={cam.zoom}
            onLoad={onLoad}
            options={mapOptions}
          >
            {anchor && footprints.map((p, i) => {
              const opacity = Math.max(MIN_OPACITY, Math.min(1, 1 - (now - p.t) / fadeMs));
              const isHead = i === footprints.length - 1;
              return (
                <MarkerF
                  key={`${p.lat.toFixed(6)},${p.lng.toFixed(6)},${i}`}
                  position={{ lat: p.lat, lng: p.lng }}
                  zIndex={i}
                  icon={{
                    path: FOOT_PATH,
                    anchor,
                    rotation: p.angle,
                    scale: isHead ? 1.55 : 1.35,
                    fillColor: ROUTE,
                    fillOpacity: opacity,
                    strokeWeight: 0,
                  }}
                />
              );
            })}
          </GoogleMap>
        </div>
      )}

      {/* Simulate button (web testing) — fakes a walking trail so you can see the
          fading, direction-pointing footprints without GPS. */}
      <button
        type="button"
        onClick={sim ? stopSim : startSim}
        style={{
          position: 'absolute', top: 12, right: 12, zIndex: 11,
          border: 'none', borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
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
        {footprints.length === 0 ? (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>No footprints yet</p>
            <p style={{ margin: '3px 0 0', opacity: 0.65, fontSize: 12 }}>
              {settings.enabled ? 'The trail appears once you start moving with tracking on.' : 'Outdoor tracking is turned off.'}
            </p>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
              {user?.name || 'David'} <span style={{ opacity: 0.55, fontWeight: 500 }}>· {footprints.length} prints</span>
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
