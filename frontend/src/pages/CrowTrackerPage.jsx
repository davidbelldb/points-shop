import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF, OverlayViewF, useJsApiLoader } from '@react-google-maps/api';
import { api } from '../lib/api.js';
import { useScrolls } from '../components/scrolls/useScrolls.js';
import ScrollComposeModal from '../components/scrolls/ScrollComposeModal.jsx';
import ScrollsListModal from '../components/scrolls/ScrollsListModal.jsx';

/*
 * "Crow Tracker" live map — the scroll-delivery twin of the On My Way tracker.
 * Opened by tapping a crow / weather Live Activity (sneakystuff://crow-tracker).
 *
 * Every crow flies a STRAIGHT LINE — "as the crow flies" — from where a scroll was
 * dispatched to where it lands (no roads / streets), driven purely by the flight's
 * timestamps so motion is buttery between the 5s polls. Multiple journeys can be in
 * the air at once; the bottom card follows the latest still-flying one. Read-only:
 * no reply pills, no "send a live message" bar — but you can read landed scrolls
 * and pen new ones. Recipient-scoped: you only ever see scrolls sent to you.
 */

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
// Marauder's Map palette. Parchment is painted under the map (no grey flash before
// tiles load); the route line + destination node use the deep oxblood red.
const PARCHMENT = '#ebc876';  // page + map fallback background (matches the map's land)
const ROUTE = '#5e1a13';   // map route line + end node
const CARD_BG = '#f7db9b'; // journey tile + "Unread scrolls" modal background
// Initial zoom-13 centre — 52°10'38.3"N 0°07'33.0"E (same as the OMW map).
const DEFAULT_CENTER = { lat: 52.177306, lng: 0.125833 };
// Flapping-flight loop: alternate the two send wing poses (wings up / wings down)
// while the crow is travelling, to animate it flying.
const FLY_FRAMES = ['/scrolls/crow_send_03.png', '/scrolls/crow_send_04.png'];
// The perched crow (final landing frame) that sits at a destination holding an
// unread scroll, until it's opened.
const PERCH_SPRITE = '/scrolls/crow_land_10.png';

// "The Marauder's Map" — Snazzy Maps #101918 (Tomas): parchment land, oxblood
// borders, cream roads. Applied to the crow tracker only (OMW keeps its dark map).
const MARAUDERS_STYLE = [
  { featureType: 'all', elementType: 'all', stylers: [{ color: '#4b0202' }, { gamma: 2.38 }, { saturation: 0 }, { visibility: 'simplified' }] },
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#ebc876' }] },
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ gamma: 0.01 }, { lightness: 20 }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ saturation: -31 }, { lightness: -33 }, { weight: 2 }, { gamma: 0.8 }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'all', stylers: [{ color: '#a00404' }, { weight: 0.18 }] },
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
  { featureType: 'transit.line', elementType: 'all', stylers: [{ color: '#4b0202' }, { weight: 0.5 }] },
  { featureType: 'water', elementType: 'all', stylers: [{ lightness: -20 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d6a95d' }] },
];

// Reject stray / null coordinates (they coerce to 0 and would blow the fit out to
// the "Europe" world view). Cambridge / UK bounding box.
const inUK = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && p.lat > 49 && p.lat < 56 && p.lng > -6 && p.lng < 2;

const FIT_PADDING = { top: 71, bottom: 210, left: 56, right: 56 };
const RECENTER_DELAY_MS = 5000;
// How long the bottom "Arrived" card shows a just-landed crow. The perched crow can
// persist far longer (a forecast stays all day), but the card should still revert to
// "no crow in flight" shortly after landing rather than sticking on the day's forecast.
const CARD_ARRIVED_MS = 5 * 60000;
const ts = (x) => new Date(x).getTime();

export default function CrowTrackerPage() {
  const { isLoaded } = useJsApiLoader({ id: 'google-map-script', googleMapsApiKey: KEY });
  const [flights, setFlights] = useState(undefined);   // undefined = loading, else array
  const [now, setNow] = useState(Date.now());          // ticks so time-based motion is smooth
  const cam = useMemo(() => ({ center: DEFAULT_CENTER, zoom: 13 }), []);
  const lastInteractRef = useRef(0);
  const programmaticRef = useRef(false);
  const recenterTimerRef = useRef(null);
  const fitPointsRef = useRef([]);
  const mapRef = useRef(null);

  // Scrolls (raven messages) — the same feature that powers /messages, reused here
  // so you can read the scroll that just landed and pen a new one to send back.
  const scrolls = useScrolls();
  const scrollSettings = scrolls.config.settings || {};
  const scrollsEnabled = !!scrollSettings.enabled;   // admin launch toggle
  const [composeOpen, setComposeOpen] = useState(false);
  const [openLocKey, setOpenLocKey] = useState(null); // "lat,lng" of a tapped perched crow
  const [stamped, setStamped] = useState(false);     // Pen-scroll seal press illusion

  // Press the seal → flip it to the stamped graphic for a beat, then open the composer.
  const openCompose = useCallback(() => {
    setStamped(true);
    setTimeout(() => { setStamped(false); setComposeOpen(true); }, 240);
  }, []);

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

  // Poll the active flights (existence / landed / ETA). Positions are driven by the
  // local clock below, so this stays a lazy 5s poll. Exposed as a stable callback so
  // reading a scroll can refetch immediately (a read scroll is deleted, so its
  // completed journey clears at once rather than lingering the full 5 min).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const fetchFlights = useCallback(() => api.scrolls.activeFlight()
    .then((r) => { if (mountedRef.current) setFlights(r.flights ?? []); })
    .catch(() => { if (mountedRef.current) setFlights((f) => (f === undefined ? [] : f)); }), []);
  useEffect(() => {
    fetchFlights();
    const id = setInterval(fetchFlights, 5000);
    return () => clearInterval(id);
  }, [fetchFlights]);

  // A single 100ms clock that all time-based motion reads from.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  // A flight's live 0…1 progress, from real time between dispatch and arrival.
  const progressOf = useCallback((f) => {
    if (!f) return 0;
    if (f.arrived) return 1;
    const started = ts(f.started_at); const arrives = ts(f.arrives_at);
    return Math.max(0, Math.min(1, (now - started) / Math.max(1, arrives - started)));
  }, [now]);

  // The flight the CARD follows: the most-recently-dispatched crow that's still in
  // the air. When it lands it drops out of the in-flight set, so the card falls back
  // to the next-latest still flying (the "original despatch"). With nothing flying,
  // it shows the most-recently-arrived crow for its "Arrived" linger.
  const focusFlight = useMemo(() => {
    if (flights === undefined) return undefined;
    if (!flights.length) return null;
    const inflight = flights.filter((f) => !f.arrived);
    if (inflight.length) return inflight.reduce((a, b) => (ts(b.started_at) > ts(a.started_at) ? b : a));
    // Only card a RECENTLY-arrived crow — a forecast now perches all day, but the card
    // shouldn't stay stuck on "Arrived" for it.
    const recent = flights.filter((f) => f.arrived && Date.now() - ts(f.arrives_at) < CARD_ARRIVED_MS);
    if (!recent.length) return null;
    return recent.reduce((a, b) => (ts(b.arrives_at) > ts(a.arrives_at) ? b : a));
  }, [flights]);

  // Flap the crows while any are travelling (shared frame — they beat in sync).
  const anyFlying = Array.isArray(flights) && flights.some((f) => !f.arrived);
  const [frameIdx, setFrameIdx] = useState(0);
  useEffect(() => {
    if (!anyFlying) { setFrameIdx(0); return undefined; }
    const id = setInterval(() => setFrameIdx((i) => (i + 1) % FLY_FRAMES.length), 160);
    return () => clearInterval(id);
  }, [anyFlying]);
  // Preload the frames once so the first wingbeat doesn't flicker.
  useEffect(() => { FLY_FRAMES.forEach((src) => { const im = new Image(); im.src = src; }); }, []);

  // Every unread scroll waiting for this user, grouped by the destination it was
  // sent to. Each group becomes ONE perched crow (crow_land_10) sitting on that
  // location with a count badge, persisting until the scroll(s) there are read —
  // independent of the 5-minute journey linger. `scrolls.scrolls` is exactly the
  // set of delivered-but-unread scrolls (reading deletes them).
  const locKey = (lat, lng) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  const unreadPerches = useMemo(() => {
    const groups = new Map();
    for (const s of (scrolls.scrolls || [])) {
      const lat = Number(s.dest_lat); const lng = Number(s.dest_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = locKey(lat, lng);
      if (!groups.has(key)) groups.set(key, { key, lat, lng, label: s.dest_label, count: 0, openable: true });
      groups.get(key).count += 1;
    }
    return [...groups.values()];
  }, [scrolls.scrolls]);

  // Perched crows to draw = the unread scrolls above, PLUS the day's forecast
  // ("Three-Eyed Crow"): forecasts aren't readable/unread scrolls, so they aren't in
  // the list, but the backend keeps the arrived forecast around all day, so it perches
  // (non-openable) until the next day rather than vanishing after landing.
  const perches = useMemo(() => {
    const list = unreadPerches.map((p) => ({ ...p }));
    for (const f of (Array.isArray(flights) ? flights : [])) {
      if (!(f.arrived && f.kind === 'forecast')) continue;
      const lat = Number(f.dest_lat); const lng = Number(f.dest_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = locKey(lat, lng);
      if (!list.some((p) => p.key === key)) list.push({ key, lat, lng, label: f.dest_label, count: 1, openable: false });
    }
    return list;
  }, [unreadPerches, flights]);

  // Live list of scrolls at the tapped location (derived, so it shrinks as they're
  // read and the reader closes itself once the location is cleared).
  const openLocScrolls = useMemo(() => {
    if (!openLocKey) return null;
    return (scrolls.scrolls || []).filter((s) => locKey(s.dest_lat, s.dest_lng) === openLocKey);
  }, [openLocKey, scrolls.scrolls]);

  // On-map geometry for each crow STILL IN FLIGHT: its straight-line position (from
  // progress) and the road ahead to its destination. Arrived crows drop out here
  // (their route hides; they become a perched crow instead). Recomputes on the clock
  // so the crows glide.
  const flightViews = useMemo(() => {
    const out = [];
    for (const f of (Array.isArray(flights) ? flights : [])) {
      if (f.arrived) continue;
      const o = { lat: Number(f.origin_lat), lng: Number(f.origin_lng) };
      const d = { lat: Number(f.dest_lat), lng: Number(f.dest_lng) };
      if (![o.lat, o.lng, d.lat, d.lng].every(Number.isFinite)) continue;
      const t = progressOf(f);
      const crowAt = { lat: o.lat + (d.lat - o.lat) * t, lng: o.lng + (d.lng - o.lng) * t };
      // The sprite is drawn facing right (east). If the journey heads west, flip it
      // horizontally so the crow faces its direction of travel rather than flying
      // backwards.
      out.push({ id: f.id, crowAt, dest: d, line: [crowAt, d], facingLeft: d.lng < o.lng });
    }
    return out;
  }, [flights, progressOf]);

  // Fit target: every in-flight crow (position + destination) AND every perched
  // crow, so the map always frames all journeys and all waiting crows at once —
  // be it one location or many.
  useEffect(() => {
    const pts = [];
    for (const fv of flightViews) { if (inUK(fv.crowAt)) pts.push(fv.crowAt); if (inUK(fv.dest)) pts.push(fv.dest); }
    perches.forEach((p) => { if (inUK(p)) pts.push({ lat: p.lat, lng: p.lng }); });
    fitPointsRef.current = pts;
  }, [flightViews, perches]);

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

  // Re-frame on each poll (a fresh `flights` array) or when the perches change —
  // NOT on the 100ms clock, so the crows glide while the camera settles per poll.
  useEffect(() => {
    if (!isLoaded) return;
    const nothing = !(Array.isArray(flights) && flights.length) && perches.length === 0;
    if (nothing) return;
    if (Date.now() - lastInteractRef.current < RECENTER_DELAY_MS) return;
    recenter();
  }, [isLoaded, flights, perches, recenter]);

  const destIcon = useMemo(() => (isLoaded ? {
    path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: ROUTE, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5,
  } : undefined), [isLoaded]);
  const mapOptions = useMemo(() => ({
    center: DEFAULT_CENTER, zoom: 13,
    disableDefaultUI: true, keyboardShortcuts: false, gestureHandling: 'greedy',
    styles: MARAUDERS_STYLE, backgroundColor: PARCHMENT, clickableIcons: false,
  }), []);

  // Live street narration for the focused flight — the same per-waypoint lines the
  // iOS Live Activity shows ("Probably somewhere over X" … "Coming in to land at
  // DEST"), swapped as that crow's smooth progress passes each waypoint.
  const cardMessage = useMemo(() => {
    const f = focusFlight;
    if (!f) return '';
    if (f.arrived) return f.message;
    const lines = f.narration; const marks = f.narration_marks;
    if (Array.isArray(lines) && lines.length && Array.isArray(marks)) {
      const t = progressOf(f);
      let phase = 0;
      for (const m of marks) { if (t >= m) phase += 1; }
      if (phase >= 1 && lines[phase - 1]) return lines[phase - 1];
    }
    return f.message;   // opening line, before the first waypoint
  }, [focusFlight, progressOf]);

  const focusProgress = progressOf(focusFlight);

  return (
    <div data-no-ptr style={{ position: 'fixed', top: 'var(--app-header-h, 0px)', left: 0, right: 0, bottom: 0, background: PARCHMENT, overscrollBehavior: 'none' }}>
      {isLoaded && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: 'calc(100% + 34px)' }}
            center={cam.center}
            zoom={cam.zoom}
            onLoad={onLoad}
            options={mapOptions}
          >
            {/* One oxblold "as the crow flies" line per in-flight journey — the road
                ahead of each crow. Arrived crows have no line (route hidden). */}
            {flightViews.map((fv) => (
              <PolylineF key={`line-${fv.id}`} path={fv.line} options={{ strokeColor: ROUTE, strokeOpacity: 0.95, strokeWeight: 6 }} />
            ))}
            {/* A destination node per in-flight journey. */}
            {destIcon && flightViews.map((fv) => (
              <MarkerF key={`dest-${fv.id}`} position={fv.dest} icon={destIcon} />
            ))}
            {/* A flapping crow per in-flight journey (crow_send_03/04). Non-interactive
                (pointer-through) so it never blocks the map, in a fixed box so the
                slightly-varied frame canvases don't make it jitter in size. */}
            {flightViews.map((fv) => (
              <OverlayViewF key={`crow-${fv.id}`} position={fv.crowAt} mapPaneName="overlayMouseTarget"
                getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}>
                <div style={{ width: 56, height: 50, pointerEvents: 'none' }}>
                  <img src={FLY_FRAMES[frameIdx]} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block',
                             transform: fv.facingLeft ? 'scaleX(-1)' : undefined }} />
                </div>
              </OverlayViewF>
            ))}
            {/* Perched crows: one per destination with unread scrolls waiting, each
                with a count badge (#5e1a13). They persist until that location's
                scroll(s) are read — independent of the journey linger — so a user
                always sees a crow over every place a scroll is waiting for them.
                Tapping one opens just that location's scrolls in the reader. */}
            {scrollsEnabled && perches.map((p) => (
              <OverlayViewF key={p.key} position={{ lat: p.lat, lng: p.lng }} mapPaneName="overlayMouseTarget"
                getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}>
                <div
                  onClick={() => p.openable && setOpenLocKey(p.key)}
                  style={{ position: 'relative', width: 52, height: 52, cursor: p.openable ? 'pointer' : 'default' }}
                >
                  <img src={PERCH_SPRITE} alt="" draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  <span style={{
                    position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, boxSizing: 'border-box',
                    padding: '0 5px', borderRadius: 999, background: '#5e1a13', color: '#fff',
                    fontSize: 12, fontWeight: 800, lineHeight: '18px', textAlign: 'center',
                    border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}>{p.count}</span>
                </div>
              </OverlayViewF>
            ))}
          </GoogleMap>
        </div>
      )}

      {/* Pen scroll — floating wax-seal button, bottom-right (above the info card).
          Pressing it flips the seal from unstamped → stamped (the stamping illusion)
          and opens the composer. */}
      {scrollsEnabled && (
        <button
          type="button"
          onClick={openCompose}
          aria-label="Pen a scroll"
          style={{
            position: 'absolute', right: 16,
            bottom: 'calc(max(20px, env(safe-area-inset-bottom)) + 122px)', zIndex: 11,
            width: 84, height: 84, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <img
            src={`/scrolls/${stamped ? 'seal_stamped' : 'seal_unstamped'}.png`}
            alt="" draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', display: 'block',
              filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))',
              transform: stamped ? 'scale(0.94)' : 'none', transition: 'transform 0.12s ease-out',
            }}
          />
          <span style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', lineHeight: 1.02, pointerEvents: 'none',
            fontFamily: 'ImperialBlack', color: '#fff', fontSize: 15, letterSpacing: '0.02em',
            textShadow: '0 1px 3px rgba(60,15,5,0.7)',
            transform: stamped ? 'scale(0.94)' : 'none', transition: 'transform 0.12s ease-out',
          }}>
            <span>Pen</span>
            <span>scroll</span>
          </span>
        </button>
      )}

      <div style={{
        position: 'absolute', left: 12, right: 12, bottom: 'max(20px, env(safe-area-inset-bottom))', zIndex: 10,
        background: CARD_BG, borderRadius: 22, padding: '11px 16px',
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)', color: '#000',
      }}>
        {focusFlight === undefined && <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>}
        {focusFlight === null && (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>No crow in flight</p>
            {unreadPerches.length > 0 ? (
              <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 13 }}>
                {scrolls.unread} scroll{scrolls.unread === 1 ? '' : 's'} waiting — tap a crow to open.
              </p>
            ) : (
              <p style={{ margin: '4px 0 0', opacity: 0.65, fontSize: 13 }}>This opens live when a scroll is on its way.</p>
            )}
          </>
        )}
        {focusFlight && (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>
                {focusFlight.traveller_name} <span style={{ opacity: 0.55, fontWeight: 500 }}>→ {focusFlight.dest_label || 'destination'}</span>
              </p>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {focusFlight.arrived ? (
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: '#000' }}>Arrived</p>
                ) : (
                  <>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 18, color: '#000' }}>{focusFlight.eta_minutes} min</p>
                    {/* Distance remaining — lower-opacity black. */}
                    {focusFlight.distance_km != null && <p style={{ margin: 0, fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>{focusFlight.distance_km} km</p>}
                  </>
                )}
              </div>
            </div>
            {cardMessage && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#000' }}>{cardMessage}</p>}
            {/* Journey bar: travelled portion solid black; untravelled track lower-opacity black. */}
            <div style={{ marginTop: 9, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.22)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((focusProgress || 0) * 100)}%`, background: '#000', transition: 'width 0.2s linear' }} />
            </div>
          </>
        )}
      </div>

      {/* Aged-parchment texture laid over the ENTIRE view — the map, the crow, the
          flight-path route lines, the progress card and the pen-scroll seal all read
          as ink on one sheet of paper. 40% opacity + boosted saturation (same as the
          footprints map). pointer-events:none so everything beneath stays fully
          interactive: map panning/zooming, tapping perched crows, the card, the seal.
          zIndex 12 sits above the card (10) and seal (11) but below the modals (80),
          so an open composer / reader still shows cleanly on top. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, zIndex: 12, pointerEvents: 'none',
          backgroundImage: 'url("/marauders_texture.jpg?v=2")',
          backgroundSize: 'cover', backgroundPosition: 'center',
          opacity: 0.4, filter: 'saturate(1.6)',
        }}
      />

      {/* Compose a scroll (reused from /messages) — the seal-and-send parchment. */}
      {scrollsEnabled && composeOpen && (
        <ScrollComposeModal
          settings={scrollSettings}
          onSend={(p) => scrolls.send(p)}
          onSent={() => setComposeOpen(false)}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {/* Read the scrolls waiting at a tapped location (reused from /messages) —
          list → full-size reader. The list is live, so it empties as they're read;
          closing it refetches the flights so a now-read journey clears at once. */}
      {scrollsEnabled && openLocKey && (
        <ScrollsListModal
          scrolls={openLocScrolls || []}
          settings={scrollSettings}
          title="Unread scrolls"
          light
          cardBg={CARD_BG}
          onRead={scrolls.markRead}
          onClose={() => { setOpenLocKey(null); scrolls.refresh(); fetchFlights(); }}
        />
      )}
    </div>
  );
}
