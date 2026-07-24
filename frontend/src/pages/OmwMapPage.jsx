import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// Initial zoom-13 centre — 52°10'38.3"N 0°07'33.0"E.
const DEFAULT_CENTER = { lat: 52.177306, lng: 0.125833 };

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

// Only accept coordinates that are actually in the Cambridge / UK area. A null or
// 0 coordinate coerces to (…,0)/(0,0) via `+null` and would otherwise blow a fit
// out to the "Europe" world view. This box rejects any such stray point.
const inUK = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && p.lat > 49 && p.lat < 56 && p.lng > -6 && p.lng < 2;

// Padding kept around the fitted route so the traveller/destination sit clear of
// the top composer and bottom info card.
const FIT_PADDING = { top: 96, bottom: 240, left: 56, right: 56 };
// How long to leave the user's manual pan/zoom alone before re-framing the route.
const RECENTER_DELAY_MS = 5000;

export default function OmwMapPage() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [trip, setTrip] = useState(undefined);
  const [display, setDisplay] = useState(0);   // eased progress
  // Frozen initial view — the map is CONSTRUCTED over Cambridge; all re-framing
  // afterwards is imperative (fitBounds), so these props never change and never
  // fight the imperative camera.
  const cam = useMemo(() => ({ center: DEFAULT_CENTER, zoom: 13 }), []);
  const lastInteractRef = useRef(0);      // ms of the user's last manual pan/zoom
  const programmaticRef = useRef(false);  // true while WE move the map (ignore our own zoom events)
  const recenterTimerRef = useRef(null);  // post-interaction re-frame timer
  const fitPointsRef = useRef([]);        // current whole-remaining-route points to frame
  const [phrases, setPhrases] = useState([]);   // this user's tap-to-send reply presets
  const [sending, setSending] = useState(false);
  const [sentText, setSentText] = useState(null);
  const [charLimit, setCharLimit] = useState(60);   // admin-set free-text length cap
  const [composeText, setComposeText] = useState('');
  const targetRef = useRef(0);
  const mapRef = useRef(null);
  const fittedTrip = useRef(null);

  // Load the logged-in user's reply phrases once.
  useEffect(() => {
    api.omw.listReplyPhrases().then((r) => setPhrases(r.phrases || [])).catch(() => {});
  }, []);

  // Fire a message (a tapped pill's template, or a typed one-and-done line).
  const fireMessage = useCallback((text, tag) => {
    const id = trip?.id;
    const body = (text || '').trim();
    if (!id || sending || !body) return;
    setSending(true); setSentText(tag ?? body);
    api.omw.sendReply(id, body).catch(() => {}).finally(() => {
      setTimeout(() => setSending(false), 1200);
      setTimeout(() => setSentText(null), 2200);
    });
  }, [trip, sending]);

  // Tap a preset pill: send its template (backend fills {name}/{obj}), fall back
  // to the pill label if no template is set.
  const sendReply = useCallback((phrase) => {
    fireMessage((phrase.sent_template || '').trim() || phrase.text, phrase.text);
  }, [fireMessage]);

  // Send the typed one-and-done message, then clear the box.
  const sendComposed = useCallback(() => {
    const body = composeText.trim();
    if (!body) return;
    fireMessage(body);
    setComposeText('');
  }, [composeText, fireMessage]);

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
      .then((r) => { if (alive) { setTrip(r.trip ?? null); if (r.messageCharLimit) setCharLimit(r.messageCharLimit); } })
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

  // Keep the fit target up to date: the whole REMAINING route (road ahead) plus
  // the traveller + destination, all UK-filtered so a stray coord can't blow the
  // view out to Europe.
  useEffect(() => {
    const pts = [];
    (remaining || []).forEach((p) => { if (inUK(p)) pts.push(p); });
    if (inUK(dest)) pts.push(dest);
    if (inUK(spriteAt)) pts.push(spriteAt);
    fitPointsRef.current = pts;
  }, [remaining, dest, spriteAt]);

  // Imperatively frame the whole remaining route (re-centres AND zooms to fit).
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
    // Ignore the zoom_changed events our own fit fires.
    window.setTimeout(() => { programmaticRef.current = false; }, 800);
  }, []);

  // A manual pan/zoom pauses auto-framing, then re-frames RECENTER_DELAY_MS after
  // the last interaction (covers both the pan and the zoom).
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
    // Only count a zoom the USER made (not our own fitBounds).
    m.addListener('zoom_changed', () => { if (!programmaticRef.current) noteInteraction(); });
    // Frame the route as soon as the map + points are ready.
    window.setTimeout(() => { if (Date.now() - lastInteractRef.current >= RECENTER_DELAY_MS) recenter(); }, 400);
  }, [noteInteraction, recenter]);

  // Follow the journey on each poll — but hold off while the user is exploring
  // (within RECENTER_DELAY_MS of their last manual pan/zoom).
  useEffect(() => {
    if (!isLoaded || !trip) return;
    if (Date.now() - lastInteractRef.current < RECENTER_DELAY_MS) return;
    recenter();
  }, [isLoaded, trip, recenter]);

  // Sprite icon at its ORIGINAL portrait ratio (151×202) so it isn't squashed.
  const spriteIcon = useMemo(() => {
    if (!isLoaded || !trip) return undefined;
    const w = 48; const h = Math.round((w * 202) / 151); // ≈ 64
    return { url: SPRITE[trip.transport] || SPRITE.bicycle, scaledSize: new window.google.maps.Size(w, h), anchor: new window.google.maps.Point(w / 2, h / 2) };
  }, [isLoaded, trip?.transport]);
  const destIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: PINK, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5,
  } : undefined), [isLoaded]);
  // STABLE options object — memoised once. center/zoom are ALSO given here so the
  // map is CONSTRUCTED over Cambridge and paints the city instantly, before any
  // async trip data arrives (without this the constructor briefly shows its world
  // default). The live camera is then driven by the controlled center/zoom props
  // below (our own Cambridge-clamped values).
  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: 13,
    disableDefaultUI: true, keyboardShortcuts: false, gestureHandling: 'greedy',
    styles: DARK_STYLE, backgroundColor: GREY, clickableIcons: false,
  }), []);

  return (
    <div style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: GREY, overscrollBehavior: 'none' }}>
      {/* The map is oversized below the visible area and this wrapper clips the
          overflow, pushing Google's bottom badge + "Map data / Terms" row off the
          bottom edge (the "Keyboard shortcuts" link is removed via options). */}
      {isLoaded && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: 'calc(100% + 34px)' }}
            center={cam.center}
            zoom={cam.zoom}
            onLoad={onLoad}
            options={mapOptions}
          >
            {/* Only the road ahead, as one solid teal line. */}
            {remaining.length > 1 && <PolylineF path={remaining} options={{ strokeColor: TEAL, strokeOpacity: 0.95, strokeWeight: 6 }} />}
            {dest && destIcon && <MarkerF position={dest} icon={destIcon} />}
            {/* Hide the travelling sprite once arrived — the pink dot marks the end. */}
            {!trip?.arrived && spriteAt && spriteIcon && <MarkerF position={spriteAt} icon={spriteIcon} zIndex={999} />}
          </GoogleMap>
        </div>
      )}

      {/* Free-text one-and-done message bar at the top (Messages-composer style).
          Only while a trip is active; sends on Enter / the send button, then clears.
          Length capped by the admin setting so it can't truncate on the banner. */}
      {trip && !trip.arrived && (
        <div style={{ position: 'absolute', top: 10, left: 12, right: 12, zIndex: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            type="text"
            value={composeText}
            maxLength={charLimit}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendComposed(); } }}
            placeholder={`Send ${trip.recipient_name || 'them'} a quick message…`}
            style={{
              flex: 1, border: 'none', borderRadius: 20, padding: '10px 14px', fontSize: 14,
              background: 'rgba(31,31,31,0.92)', color: '#fff', outline: 'none',
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
            }}
          />
          <button
            type="button"
            onClick={sendComposed}
            disabled={sending || !composeText.trim()}
            aria-label="Send"
            style={{
              width: 40, height: 40, flexShrink: 0, borderRadius: 20, border: 'none',
              background: TEAL, color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer',
              opacity: sending || !composeText.trim() ? 0.5 : 1,
              boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            }}
          >
            ↑
          </button>
        </div>
      )}

      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* Tap-to-send reply phrases — this user's presets. Small pills, flowing
            left→right, capped at ~two rows (scrolls if it overflows). */}
        {trip && !trip.arrived && phrases.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start',
            maxHeight: 68, overflowY: 'auto',
          }}>
            {phrases.map((p) => {
              const isSent = sentText === p.text;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={sending}
                  onClick={() => sendReply(p)}
                  style={{
                    border: 'none', borderRadius: 999, padding: '6px 11px',
                    background: PINK, color: '#fff', fontSize: 12, fontWeight: 600,
                    lineHeight: 1.2, whiteSpace: 'nowrap',
                    opacity: sending && !isSent ? 0.45 : 1,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.4)', cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {isSent ? 'Sent' : p.text}
                </button>
              );
            })}
          </div>
        )}

      <div style={{
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
                {trip.arrived ? (
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: TEAL }}>Arrived</p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: PINK }}>{trip.eta_minutes} min</p>
                    {trip.distance_km != null && <p style={{ margin: 0, fontSize: 11, opacity: 0.55 }}>{trip.distance_km} km</p>}
                  </>
                )}
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
    </div>
  );
}
