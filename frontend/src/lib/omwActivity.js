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
export async function startOmwTrip() {
  const origin = await currentPosition();
  const trip = await api.omw.startTrip(origin);
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
