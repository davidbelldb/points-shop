import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, MarkerF, PolylineF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';

/*
 * "On My Way" live map — opened by tapping the Live Activity (sneakystuff://
 * on-my-way). Polls the viewer's active trip and draws the route (teal), the
 * traveller's live position (pink dot) and the destination, themed to the app's
 * grey / teal / pink. Falls back gracefully when nobody's on their way.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const GREY = '#1f1f1f';
const TEAL = '#15b8a6';
const PINK = '#ee70bd';
const DEFAULT_CENTER = { lat: 52.2053, lng: 0.1218 };

// Dark "shades of grey" base (matches the timeline map), tuned darker to sit on #1f1f1f.
const DARK_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1414' }] },
];

const toLatLng = (p) => (Array.isArray(p) ? { lat: Number(p[0]), lng: Number(p[1]) } : null);

export default function OmwMapPage() {
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [trip, setTrip] = useState(undefined); // undefined = loading, null = none
  const mapRef = useRef(null);
  const fittedTrip = useRef(null);

  // Poll the active trip.
  useEffect(() => {
    let alive = true;
    const tick = () => api.omw.activeTrip()
      .then((r) => { if (alive) setTrip(r.trip ?? null); })
      .catch(() => { if (alive) setTrip((t) => (t === undefined ? null : t)); });
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const path = useMemo(
    () => (trip?.route_points || []).map(toLatLng).filter(Boolean),
    [trip?.route_points],
  );
  const current = trip?.current_lat != null ? { lat: Number(trip.current_lat), lng: Number(trip.current_lng) } : null;
  const dest = trip?.dest_lat != null ? { lat: Number(trip.dest_lat), lng: Number(trip.dest_lng) } : null;

  // Fit the map to the route once per trip (not on every poll).
  const onLoad = useCallback((m) => { mapRef.current = m; }, []);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !isLoaded || !trip) return;
    if (fittedTrip.current === trip.id) return;
    const pts = path.length ? path : [current, dest].filter(Boolean);
    if (!pts.length) return;
    const b = new window.google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    m.fitBounds(b, 64);
    fittedTrip.current = trip.id;
  }, [isLoaded, trip, path, current, dest]);

  const dotIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 8, fillColor: PINK, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2.5,
  } : undefined), [isLoaded]);
  const destIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 7, fillColor: TEAL, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2,
  } : undefined), [isLoaded]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: GREY }}>
      {/* Map */}
      {isLoaded && (
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={current || dest || DEFAULT_CENTER}
          zoom={14}
          onLoad={onLoad}
          options={{ disableDefaultUI: true, gestureHandling: 'greedy', styles: DARK_STYLE, backgroundColor: GREY }}
        >
          {path.length > 1 && (
            <PolylineF path={path} options={{ strokeColor: TEAL, strokeOpacity: 0.95, strokeWeight: 5 }} />
          )}
          {dest && destIcon && <MarkerF position={dest} icon={destIcon} />}
          {current && dotIcon && <MarkerF position={current} icon={dotIcon} zIndex={999} />}
        </GoogleMap>
      )}

      {/* Close */}
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

      {/* Bottom card */}
      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        background: 'rgba(31,31,31,0.94)', borderRadius: 20, padding: '16px 18px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', color: '#fff',
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
                {trip.traveller_name} → {trip.dest_label || 'destination'}
              </p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: PINK, whiteSpace: 'nowrap' }}>
                {trip.eta_minutes} min
              </p>
            </div>
            {trip.message && <p style={{ margin: '6px 0 0', opacity: 0.85, fontSize: 13 }}>{trip.message}</p>}
            <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((trip.progress || 0) * 100)}%`, background: TEAL, transition: 'width 1.2s ease' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
