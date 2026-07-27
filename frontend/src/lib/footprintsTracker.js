import { api } from './api.js';

/*
 * Footprints reporter (David broadcasts).
 *
 * Foreground / PWA path: a geolocation watch posts outdoor pings, gated so prints
 * land ~`spacing_m` apart. This is live whenever the app/PWA is open.
 *
 * Always-on native background (app closed) is the next piece: extend the native
 * OmwActivity plugin with a continuous "presence" mode that emits background
 * location events, and funnel them through `reportFootprint()` below — the JS
 * gating/posting here is already the single choke point for that.
 */

let watchId = null;
let running = false;
let enabled = false;
let spacingM = 15;
let configTimer = null;
const MIN_INTERVAL_MS = 5000;
let last = { lat: null, lng: null, at: 0 };

const toRad = (d) => (d * Math.PI) / 180;
function metresBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const dLat = toRad(bLat - aLat); const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function refreshConfig() {
  try {
    const s = await api.footprints.settings();
    const out = s?.outdoor;
    if (out) { enabled = !!out.enabled; spacingM = Number(out.spacing_m) || 15; }
  } catch { /* keep last known config */ }
}

// Single choke point: gate by outdoor on/off, time, and spacing, then post.
export function reportFootprint(lat, lng) {
  if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const now = Date.now();
  if (now - last.at < MIN_INTERVAL_MS) return;
  if (last.lat != null && metresBetween(last.lat, last.lng, lat, lng) < spacingM * 0.6) return;
  last = { lat, lng, at: now };
  api.footprints.ping('outdoor', lat, lng).catch(() => {});
}

export async function startFootprints() {
  if (running || typeof navigator === 'undefined' || !navigator.geolocation) return;
  running = true;
  await refreshConfig();
  configTimer = setInterval(refreshConfig, 30000);
  watchId = navigator.geolocation.watchPosition(
    (pos) => reportFootprint(pos.coords.latitude, pos.coords.longitude),
    () => {},
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
  );
}

export function stopFootprints() {
  if (watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (configTimer) { clearInterval(configTimer); configTimer = null; }
  running = false;
}

// Whether the geolocation watch is currently active (so a UI toggle can reflect
// the real state even after navigating away and back).
export function isFootprintsTracking() {
  return running;
}
