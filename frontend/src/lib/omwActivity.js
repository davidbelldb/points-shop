import { Capacitor, registerPlugin } from '@capacitor/core';
import { api } from './api.js';

/*
 * "On My Way" bridge.
 *
 * Two jobs:
 *  1. Hand the ActivityKit push tokens (push-to-start + per-trip update) to the
 *     backend, exactly like crowActivity.js does for scrolls — this is what lets
 *     the server start/update the OMW activity while the app is closed.
 *  2. Drive location pings. The native OmwActivity plugin captures background
 *     location and emits 'omwPing' events; we also run a foreground
 *     watchPosition as a fallback, so progress advances whether the app is open
 *     or backgrounded. Both funnel into api.omw.ping for the active trip.
 *
 * On web everything no-ops gracefully (registerPlugin still resolves; geolocation
 * works in the browser for quick desktop testing).
 */

const Native = Capacitor.isNativePlatform() ? registerPlugin('OmwActivity') : null;

let wired = false;
let activeTripId = null;
let watchId = null;
let lastPingAt = 0;
let starting = false;      // guards against concurrent starts
let lastStartAt = 0;       // debounces rapid double-triggers

// Never ping more than ~once every 4s regardless of source (native + web can
// both fire); the Live Activity doesn't need finer granularity.
const MIN_PING_MS = 4000;

function forwardPing(lat, lng) {
  if (!activeTripId) return;
  const now = Date.now();
  if (now - lastPingAt < MIN_PING_MS) return;
  lastPingAt = now;
  api.omw.ping(activeTripId, lat, lng)
    .then((r) => { if (r?.arrived) stopOmwTrip({ silent: true }); })
    .catch(() => {});
}

/** Register for push tokens + native ping events. Safe to call repeatedly. */
export function enableOmwPush() {
  if (!Capacitor.isNativePlatform() || wired || !Native) return;
  wired = true;
  try {
    Native.addListener('omwPtsToken', ({ token }) => {
      api.omw.registerToken('pts', token).catch(() => {});
    });
    Native.addListener('omwUpdateToken', ({ tripId, token }) => {
      api.omw.registerToken('update', token, tripId).catch(() => {});
    });
    Native.addListener('omwPing', ({ lat, lng }) => forwardPing(lat, lng));
    Native.enablePush();
  } catch { /* plugin unavailable — ignore */ }
  // Populate the long-press menu + Siri with the user's destinations, and pick
  // up any journey Siri queued while the app was closed.
  syncOmwShortcuts();
  consumeOmwPendingTrigger();
}

function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

/**
 * Start an OMW trip from the current location. Kicks the backend (which
 * push-to-starts the Live Activity), asks the native plugin to begin background
 * location, and runs a foreground watchPosition fallback.
 * @returns {Promise<object>} the created trip
 */
export async function startOmwTrip(destId, transport) {
  // Guard against double-fire: ignore a second trigger while one is starting or
  // within a few seconds of the last (prevents duplicate trips/activities).
  if (starting || Date.now() - lastStartAt < 6000) return null;
  starting = true; lastStartAt = Date.now();
  try {
    const origin = await currentPosition();
    const trip = await api.omw.startTrip(origin, destId, transport);
    activeTripId = trip.id;
    lastPingAt = 0;

  // Native background location (best transport; keeps advancing app-closed).
  try {
    Native?.startTracking({ tripId: trip.id, destLat: trip.dest_lat, destLng: trip.dest_lng });
  } catch { /* native optional */ }

    // Foreground fallback — advances progress while the app is open, and is the
    // only source on web.
    if (navigator.geolocation && watchId == null) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => forwardPing(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
      );
    }
    return trip;
  } finally {
    starting = false;
  }
}

/** Stop the active trip: clear watchers, tell native to stop, dismiss the
 *  activity. `silent` skips the backend cancel (used when the trip already
 *  arrived server-side). */
export async function stopOmwTrip({ silent = false } = {}) {
  const tripId = activeTripId;
  activeTripId = null;
  if (watchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  try { Native?.stopTracking(); } catch { /* ignore */ }
  if (tripId && !silent) { try { await api.omw.endTrip(tripId); } catch { /* ignore */ } }
}

export function activeOmwTripId() { return activeTripId; }

/**
 * Fire a journey directly from a quick-action deep link (/omw/go?dest=<id>),
 * with no test-harness page involved. Gets location, starts the trip (transport
 * = the account's current setting), and the Live Activity appears. Returns true
 * on success. Surfaces a minimal alert on failure (e.g. location denied).
 */
export async function triggerOmwFromUrl(url) {
  try {
    const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    const destId = new URLSearchParams(qs).get('dest') || undefined;
    await startOmwTrip(destId);
    return true;
  } catch (e) {
    try { window.alert(e?.message || 'Could not start your journey — check location access.'); } catch { /* ignore */ }
    return false;
  }
}

/** Push the user's quick destinations to the Home-screen long-press menu (one
 *  item each) AND into the App Group for the Siri intent. No-op on web. Call
 *  after login and whenever the destinations change. */
export async function syncOmwShortcuts() {
  if (!Capacitor.isNativePlatform() || !Native) return;
  try {
    const { destinations } = await api.omw.listQuickDestinations();
    const items = (destinations || []).map((d) => ({ id: d.id, label: d.label }));
    Native.setShortcuts({ items });
  } catch { /* ignore */ }
}

/** If Siri (or a Shortcut) queued a journey, pick it up and fire it. Call on app
 *  launch and every time the app returns to the foreground. */
export async function consumeOmwPendingTrigger() {
  if (!Capacitor.isNativePlatform() || !Native) return;
  try {
    const { dest } = await Native.consumePendingTrigger();
    if (dest) await triggerOmwFromUrl(`/omw/go?dest=${dest}`);
  } catch { /* ignore */ }
}
