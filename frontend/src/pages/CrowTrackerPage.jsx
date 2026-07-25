import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';

/*
 * "Crow Tracker" live map — the scroll-delivery twin of the On My Way tracker.
 * Opened by tapping a crow / weather Live Activity (sneakystuff://crow-tracker).
 *
 * The crow flies a STRAIGHT LINE — "as the crow flies" — from where the scroll was
 * dispatched to where it lands (no roads / streets). The route ahead is drawn as a
 * solid teal line; the crow sprite rides at the head of it and glides smoothly,
 * driven purely by the flight's timestamps (so it's buttery even between the 5s
 * polls). Deliberately read-only: no reply pills, no "send a live message" bar.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
// Marauder's Map palette. Parchment is painted under the map (no grey flash before
// tiles load); the route line + destination node use the deep oxblood red.
const PARCHMENT = '#ebc876';
const ROUTE = '#5e1a13';   // map route line + end node
const TEAL = '#15b8a6';    // info-card "Arrived" + progress bar fill
const PINK = '#ee70bd';    // info-card ETA
// Initial zoom-13 centre — 52°10'38.3"N 0°07'33.0"E (same as the OMW map).
const DEFAULT_CENTER = { lat: 52.177306, lng: 0.125833 };
// The in-flight crow sprite shown on the map. Faces right; drawn at its natural ratio.
const CROW_SPRITE = '/scrolls/crow_map.png';

// "The Marauder's Map" — Snazzy Maps #101918 (Tomas): parchment land, oxblood
// borders, cream roads. Applied to the crow tracker only (OMW keeps its dark map).
const MARAUDERS_STYLE = [
  { featureType: 'all', elementType: 'all', stylers: [{ color: '#4b0202' }, { gamma: '2.38' }, { saturation: '0' }, { visibility: 'simplified' }] },
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#ebc876' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ gamma: 0.01 }, { lightness: 20 }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ saturation: -31 }, { lightness: -33 }, { weight: 2 }, { gamma: 0.8 }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'all', stylers: [{ color: '#a00404' }, { weight: '0.18' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ color: '#980000' }] },
  { featureType: 'administrative.country', elementType: 'all', stylers: [{ color: '#690000' }] },
  { featureType: 'administrative.province', elementType: 'all', stylers: [{ color: '#950000' }] },
  { featureType: 'administrative.locality', elementType: 'all', stylers: [{ color: '#4b0202' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ lightness: 30 }, { saturation: 30 }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ saturation: 20 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ lightness: 20 }, { saturation: -20 }] },
  { featureType: 'road', elementType: 'all', stylers: [{ color: '#fff0bc' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ lightness: 10 }, { saturation: -30 }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ saturation: 25 }, { lightness: 25 }] },
  { featureType: 'transit.line', elementType: 'all', stylers: [{ color: '#4b0202' }, { weight: '0.50' }] },
  { featureType: 'water', elementType: 'all', stylers: [{ lightness: -20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d6a95d' }] },
];

function haversine(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function cumulative(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  return cum;
}
// Point at `dist` km along the polyline, plus the index of the first point after it.
function pointAtDistance(points, cum, dist) {
  if (points.length < 2) return { pt: points[0], idx: 1 };
  const total = cum[cum.length - 1];
  if (dist <= 0) return { pt: points[0], idx: 1 };
  if (dist >= total) return { pt: points[points.length - 1], idx: points.length };
  let i = 1; while (i < points.length && cum[i] < dist) i += 1;
  const t = cum[i] > cum[i - 1] ? (dist - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
  const pt = {
    lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
    lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
  };
  return { pt, idx: i };
}

// Reject stray / null coordinates (they coerce to 0 and would blow the fit out to
// the "Europe" world view). Cambridge / UK bounding box.
const inUK = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && p.lat > 49 && p.lat < 56 && p.lng > -6 && p.lng < 2;

const FIT_PADDING = { top: 71, bottom: 210, left: 56, right: 56 };
const RECENTER_DELAY_MS = 5000;

export default function CrowTrackerPage() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [flight, setFlight] = useState(undefined);
  const [display, setDisplay] = useState(0);   // live progress 0…1, time-derived
  const cam = useMemo(() => ({ center: DEFAULT_CENTER, zoom: 13 }), []);
  const lastInteractRef = useRef(0);
  const programmaticRef = useRef(false);
  const recenterTimerRef = useRef(null);
  const fitPointsRef = useRef([]);
  const mapRef = useRef(null);
  // Flight timing for the smooth progress clock (avoids re-subscribing the timer).
  const clockRef = useRef(null);   // { startedMs, arrivesMs, landed }

  // Disable pull-to-refresh / rubber-band scroll while the full-screen map is up.
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = { h: html.style.overscrollBehavior, bo: body.style.overscrollBehavior, ov: body.style.overflow };
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    const blockPull = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('.gm-style')) return; // let the map pan
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockPull, { passive: false });
    return () => {
      html.style.overscrollBehavior = prev.h; body.style.overscrollBehavior = prev.bo; body.style.overflow = prev.ov;
      document.removeEventListener('touchmove', blockPull, { passive: false });
    };
  }, []);

  // Poll the active flight (existence / landed / ETA). Position itself is driven
  // by the local clock below, so this can stay a lazy 5s poll.
  useEffect(() => {
    let alive = true;
    const tick = () => api.scrolls.activeFlight()
      .then((r) => { if (alive) setFlight(r.flight ?? null); })
      .catch(() => { if (alive) setFlight((f) => (f === undefined ? null : f)); });
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Keep the progress clock in sync with the latest flight timestamps.
  useEffect(() => {
    if (!flight) { clockRef.current = null; return; }
    clockRef.current = {
      startedMs: new Date(flight.started_at).getTime(),
      arrivesMs: new Date(flight.arrives_at).getTime(),
      landed: !!flight.arrived,
    };
  }, [flight?.id, flight?.started_at, flight?.arrives_at, flight?.arrived]);

  // The smooth progress clock — recomputes the fraction from real time every 100ms.
  useEffect(() => {
    const id = setInterval(() => {
      const c = clockRef.current;
      if (!c) { setDisplay(0); return; }
      if (c.landed) { setDisplay(1); return; }
      const total = Math.max(1, c.arrivesMs - c.startedMs);
      setDisplay(Math.max(0, Math.min(1, (Date.now() - c.startedMs) / total)));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Straight origin → destination line ("as the crow flies") — no road routing.
  const routePts = useMemo(() => {
    if (!flight) return [];
    const o = { lat: Number(flight.origin_lat), lng: Number(flight.origin_lng) };
    const d = { lat: Number(flight.dest_lat), lng: Number(flight.dest_lng) };
    return [o, d].filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [flight?.origin_lat, flight?.origin_lng, flight?.dest_lat, flight?.dest_lng]);

  const cum = useMemo(() => cumulative(routePts), [routePts]);
  const total = cum.length ? cum[cum.length - 1] : 0;

  const split = useMemo(
    () => (routePts.length >= 2 ? pointAtDistance(routePts, cum, display * total) : null),
    [routePts, cum, total, display],
  );
  // The line still AHEAD of the crow — from its current point to the destination.
  const remaining = split ? [split.pt].concat(routePts.slice(split.idx)) : routePts;
  const dest = flight?.dest_lat != null ? { lat: Number(flight.dest_lat), lng: Number(flight.dest_lng) } : null;
  const crowAt = split ? split.pt : (flight?.current_lat != null ? { lat: Number(flight.current_lat), lng: Number(flight.current_lng) } : null);

  // Keep the fit target current: the whole remaining line + the crow + destination.
  useEffect(() => {
    const pts = [];
    (remaining || []).forEach((p) => { if (inUK(p)) pts.push(p); });
    if (inUK(dest)) pts.push(dest);
    if (inUK(crowAt)) pts.push(crowAt);
    fitPointsRef.current = pts;
  }, [remaining, dest, crowAt]);

  const recenter = useCallback(() => {
    const m = mapRef.current;
    const pts = fitPointsRef.current;
    if (!m || !window.google || !pts.length) return;
    programmaticRef.current = true;
    if (pts.length === 1) { m.setCenter(pts[0]); m.setZoom(15); }
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
    m.setCenter(DEFAULT_CENTER); m.setZoom(13);
    m.addListener('dragstart', noteInteraction);
    m.addListener('zoom_changed', () => { if (!programmaticRef.current) noteInteraction(); });
    window.setTimeout(() => { if (Date.now() - lastInteractRef.current >= RECENTER_DELAY_MS) recenter(); }, 400);
  }, [noteInteraction, recenter]);

  // Re-frame on each poll (a fresh `flight` object), unless the user is exploring
  // the map. Deliberately NOT tied to `display` — the crow glides smoothly between
  // polls while the camera settles once per poll (as the OMW map does), rather than
  // re-fitting 10×/second.
  useEffect(() => {
    if (!isLoaded || !flight) return;
    if (Date.now() - lastInteractRef.current < RECENTER_DELAY_MS) return;
    recenter();
  }, [isLoaded, flight, recenter]);

  // Crow sprite at its natural ratio (230×198). Constant, so it's built once the
  // Maps SDK is ready (not rebuilt each poll); the marker itself is only rendered
  // while a crow is in flight.
  const crowIcon = useMemo(() => {
    if (!isLoaded) return undefined;
    const w = 54; const h = Math.round((w * 198) / 222); // ≈ 48 (crow_map.png is 222×198)
    return { url: CROW_SPRITE, scaledSize: new window.google.maps.Size(w, h), anchor: new window.google.maps.Point(w / 2, h / 2) };
  }, [isLoaded]);
  const destIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: ROUTE, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5,
  } : undefined), [isLoaded]);
  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: 13,
    disableDefaultUI: true, keyboardShortcuts: false, gestureHandling: 'greedy',
    styles: MARAUDERS_STYLE, backgroundColor: PARCHMENT, clickableIcons: false,
  }), []);

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
            {/* The flight still ahead, one solid oxblood line, straight as the crow flies. */}
            {remaining.length > 1 && <PolylineF path={remaining} options={{ strokeColor: ROUTE, strokeOpacity: 0.95, strokeWeight: 6 }} />}
            {dest && destIcon && <MarkerF position={dest} icon={destIcon} />}
            {/* Hide the crow once landed — the pink dot marks the destination. */}
            {!flight?.arrived && crowAt && crowIcon && <MarkerF position={crowAt} icon={crowIcon} zIndex={999} />}
          </GoogleMap>
        </div>
      )}

      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        background: 'rgba(31,31,31,0.94)', borderRadius: 22, padding: '11px 16px',
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', color: '#fff',
      }}>
        {flight === undefined && <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>}
        {flight === null && (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>No crow in flight</p>
            <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 13 }}>This opens live when a scroll is on its way.</p>
          </>
        )}
        {flight && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
                {flight.traveller_name} <span style={{ opacity: 0.55, fontWeight: 500 }}>→ {flight.dest_label || 'destination'}</span>
              </p>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {flight.arrived ? (
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: TEAL }}>Arrived</p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: PINK }}>{flight.eta_minutes} min</p>
                    {flight.distance_km != null && <p style={{ margin: 0, fontSize: 11, opacity: 0.55 }}>{flight.distance_km} km</p>}
                  </>
                )}
              </div>
            </div>
            {flight.message && <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: 13 }}>{flight.message}</p>}
            <div style={{ marginTop: 9, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((display || 0) * 100)}%`, background: TEAL, transition: 'width 0.2s linear' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
