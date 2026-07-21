import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';

/*
 * "On My Way" live map — an Uber/Deliveroo-style tracker. The route is split into
 * a solid TRAVELLED portion (teal) and a DASHED remaining portion; the traveller's
 * SPRITE rides at the head of the travelled part and glides smoothly between the
 * 4-second server polls. Themed to the app's grey / teal / pink.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const GREY = '#1f1f1f';
const TEAL = '#15b8a6';
const PINK = '#ee70bd';
const DEFAULT_CENTER = { lat: 52.2053, lng: 0.1218 };

const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1f1f1f' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8f8f8f' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f1f1f' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2b2b2b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7a7a7a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#383838' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#12181a' }] },
];

const SPRITE = {
  scooter: '/omw/david_scoot_leave.png',
  uber: '/omw/katie_taxi_leave.png',
  bicycle: '/omw/david_leave.png',
};

const toLatLng = (p) => (Array.isArray(p) ? { lat: Number(p[0]), lng: Number(p[1]) } : null);

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

export default function OmwMapPage() {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [trip, setTrip] = useState(undefined);
  const [display, setDisplay] = useState(0);   // eased progress
  const targetRef = useRef(0);
  const mapRef = useRef(null);
  const fittedTrip = useRef(null);

  // Disable pull-to-refresh / rubber-band scroll while the full-screen map is up.
  // The CSS overscroll-behavior isn't enough on its own inside the iOS webview, so
  // we also swallow any touchmove that ISN'T panning the Google map itself — that
  // kills the browser pull-to-refresh on the card/edges while leaving map gestures
  // (which live inside `.gm-style`) fully intact.
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

  useEffect(() => {
    let alive = true;
    const tick = () => api.omw.activeTrip()
      .then((r) => { if (alive) setTrip(r.trip ?? null); })
      .catch(() => { if (alive) setTrip((t) => (t === undefined ? null : t)); });
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Sprite position eases toward the fraction along the CURRENT polyline
  // (route_progress) so it stays correct across reroutes; the bar uses overall progress.
  useEffect(() => { targetRef.current = trip?.route_progress ?? trip?.progress ?? 0; }, [trip?.route_progress, trip?.progress]);
  // Smoothly ease the on-map position toward the latest server value.
  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((d) => {
        const t = targetRef.current;
        return Math.abs(t - d) < 0.0008 ? t : d + (t - d) * 0.16;
      });
    }, 90);
    return () => clearInterval(id);
  }, []);

  const routePts = useMemo(() => {
    const pts = (trip?.route_points || []).map(toLatLng).filter(Boolean);
    if (pts.length >= 2) return pts;
    const o = trip?.origin_lat != null ? { lat: Number(trip.origin_lat), lng: Number(trip.origin_lng) } : null;
    const d = trip?.dest_lat != null ? { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) } : null;
    return [o, d].filter(Boolean);
  }, [trip?.route_points, trip?.origin_lat, trip?.origin_lng, trip?.dest_lat, trip?.dest_lng]);

  const cum = useMemo(() => cumulative(routePts), [routePts]);
  const total = cum.length ? cum[cum.length - 1] : 0;

  // When the route changes (a reroute swaps the polyline), snap the sprite to the
  // new position instead of sliding backward along the fresh line.
  const routeSig = useMemo(
    () => (routePts.length ? `${routePts.length}:${routePts[routePts.length - 1]?.lat?.toFixed(5)}` : ''),
    [routePts],
  );
  const prevSig = useRef('');
  useEffect(() => {
    if (routeSig && routeSig !== prevSig.current) { prevSig.current = routeSig; setDisplay(targetRef.current); }
  }, [routeSig]);

  const split = useMemo(
    () => (routePts.length >= 2 ? pointAtDistance(routePts, cum, display * total) : null),
    [routePts, cum, total, display],
  );
  // Only the road AHEAD — from the sprite's current point to the destination.
  const remaining = split ? [split.pt].concat(routePts.slice(split.idx)) : routePts;
  const dest = trip?.dest_lat != null ? { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) } : null;
  const spriteAt = split ? split.pt : (trip?.current_lat != null ? { lat: Number(trip.current_lat), lng: Number(trip.current_lng) } : null);

  // Imperatively pin the view over Cambridge the instant the map exists —
  // options.center/zoom aren't reliably honoured on mount (it falls back to the
  // zoom-0 world view = "Europe"), and a one-shot set here doesn't fight the
  // later fitBounds the way controlled center/zoom props would.
  const onLoad = useCallback((m) => {
    mapRef.current = m;
    m.setCenter(DEFAULT_CENTER);
    m.setZoom(13);
  }, []);
  // Keep the traveller AND destination framed at all times — re-fit on each 4s
  // poll (padding the bottom so the info card doesn't cover them). As the gap
  // closes it naturally zooms in.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !isLoaded || !trip) return;
    const finite = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
    const cur = trip.current_lat != null ? { lat: +trip.current_lat, lng: +trip.current_lng }
      : (trip.origin_lat != null ? { lat: +trip.origin_lat, lng: +trip.origin_lng } : null);
    const dst = trip.dest_lat != null ? { lat: +trip.dest_lat, lng: +trip.dest_lng } : null;
    const pts = [cur, dst].filter(finite);
    if (!pts.length) return;
    if (pts.length === 1) { m.setCenter(pts[0]); m.setZoom(15); return; }
    const b = new window.google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    m.fitBounds(b, { top: 90, bottom: 230, left: 60, right: 60 });
  }, [isLoaded, trip]);

  // Sprite icon at its ORIGINAL portrait ratio (151×202) so it isn't squashed.
  const spriteIcon = useMemo(() => {
    if (!isLoaded || !trip) return undefined;
    const w = 48; const h = Math.round((w * 202) / 151); // ≈ 64
    return { url: SPRITE[trip.transport] || SPRITE.bicycle, scaledSize: new window.google.maps.Size(w, h), anchor: new window.google.maps.Point(w / 2, h / 2) };
  }, [isLoaded, trip?.transport]);
  const destIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: PINK, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5,
  } : undefined), [isLoaded]);
  // STABLE options object — recreating it each render made the map reset its view
  // and fight fitBounds. Memoised once, with a Cambridge starting view baked in so
  // it OPENS over the city (no wide/Europe flash) before the fit fine-tunes it.
  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: 12,
    disableDefaultUI: true, gestureHandling: 'greedy', styles: DARK_STYLE, backgroundColor: GREY, clickableIcons: false,
  }), []);

  return (
    <div style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: GREY, overscrollBehavior: 'none' }}>
      {isLoaded && (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          onLoad={onLoad}
          options={mapOptions}
        >
          {/* Only the road ahead, as one solid teal line. */}
          {remaining.length > 1 && <PolylineF path={remaining} options={{ strokeColor: TEAL, strokeOpacity: 0.95, strokeWeight: 6 }} />}
          {dest && destIcon && <MarkerF position={dest} icon={destIcon} />}
          {spriteAt && spriteIcon && <MarkerF position={spriteAt} icon={spriteIcon} zIndex={999} />}
        </GoogleMap>
      )}

      <button
        type="button"
        onClick={() => navigate('/messages')}
        aria-label="Close"
        style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16, zIndex: 10,
          width: 40, height: 40, borderRadius: 20, border: 'none',
          background: 'rgba(31,31,31,0.85)', color: '#fff', fontSize: 20, backdropFilter: 'blur(6px)',
        }}
      >
        ×
      </button>

      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        background: 'rgba(31,31,31,0.94)', borderRadius: 22, padding: '16px 18px',
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', color: '#fff',
      }}>
        {trip === undefined && <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>}
        {trip === null && (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>No one's on their way</p>
            <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 13 }}>This opens live when a journey is running.</p>
          </>
        )}
        {trip && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
                {trip.traveller_name} <span style={{ opacity: 0.55, fontWeight: 500 }}>→ {trip.dest_label || 'destination'}</span>
              </p>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: PINK }}>{trip.eta_minutes} min</p>
                {trip.distance_km != null && <p style={{ margin: 0, fontSize: 11, opacity: 0.55 }}>{trip.distance_km} km to go</p>}
              </div>
            </div>
            {trip.message && <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: 13 }}>{trip.message}</p>}
            <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((display || 0) * 100)}%`, background: TEAL, transition: 'width 0.2s linear' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
