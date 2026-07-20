import { query } from '../../db.js';
import { isMuted } from '../notifications/push.js';
import {
  sendLiveActivityPush, omwContentState,
  createBroadcastChannel, deleteBroadcastChannel, sendBroadcast, sendSilentWake,
} from '../notifications/apns.js';
import { buildFlightPath } from '../scrolls/flightPath.js';

/*
 * "On My Way" — live Live Activity.
 *
 * Pacing is by REAL POSITION ALONG THE ROUTE, not a clock. At trip start we plot
 * a road route (OSRM) start→dest and keep its polyline. Every location ping
 * projects the traveller's position onto that polyline and measures how far
 * along it they are — so progress = distance covered / route length. The three
 * waypoint nodes sit at 25/50/75% of the route distance. If the traveller
 * deviates from the plotted route, the projection maps them to the nearest point
 * on it, so progress still reads sensibly (and never goes backwards).
 *
 * Transport (bicycle | scooter) sets the ETA shown in admin and which sprite the
 * widget renders; it does NOT drive pacing — distance does.
 *
 * Live GPS also reverse-geocodes the current street for the narration line and
 * detects real arrival (within ~80 m).
 *
 * v1 is a self-test: the trip loops back to the traveller (viewer = traveller).
 */

const ATTR_TYPE = 'OmwActivityAttributes';

// Node positions as fractions of ROUTE DISTANCE. A node pops once the traveller
// has covered that fraction of the route.
const WAYPOINT_FRACS = [0.25, 0.5, 0.75];
// Per-transport speed (km/h) — used only to show an ETA. Tuned so a ~3.5 km ride
// reads ≈14 min by bike / ≈12 min by e-scooter (scooter is capped ~14 mph, so
// its real average with stops isn't far above cycling). Nudge to taste.
const TRANSPORT_KMH = { bicycle: 15, scooter: 17 };
const DEFAULT_TRANSPORT = 'bicycle';
function transportKmh(t) { return TRANSPORT_KMH[t] || TRANSPORT_KMH[DEFAULT_TRANSPORT]; }
function normTransport(t) { return t === 'scooter' ? 'scooter' : 'bicycle'; }
// Straight-line → road padding when routing is unavailable (roads wind).
const ROAD_FACTOR = 1.3;
// ETA display floor.
const MIN_ETA_SECONDS = 60;
// Treat the traveller as arrived within this distance of the destination (~80 m).
const ARRIVE_KM = 0.08;
// Seconds the "arrived" state lingers before the banner dismisses itself.
const ARRIVE_LINGER_MS = 6000;
// Reverse-geocode at most once every 12s per trip (Nominatim asks for ≤1 req/s).
const GEO_THROTTLE_MS = 12_000;

// In-memory street cache per trip: tripId -> { at, street }.
const streetCache = new Map();

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

export function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((n) => n == null || Number.isNaN(Number(n)))) return 0;
  const R = 6371;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Total length (km) of a [[lat,lng],…] polyline.
function polylineKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return total;
}

// Project (lat,lng) onto the route polyline and return { alongKm, totalKm }:
// how far along the route the nearest point to the traveller sits. Handles
// deviation — an off-route point still snaps to its closest route segment.
function alongRouteKm(points, lat, lng) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const k = Math.cos((lat * Math.PI) / 180) || 1;   // local equirectangular scale
  const px = lng * k; const py = lat;
  let cum = 0; let best = null;
  for (let i = 1; i < points.length; i += 1) {
    const ay = points[i - 1][0]; const ax = points[i - 1][1] * k;
    const by = points[i][0]; const bx = points[i][1] * k;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx; const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    const segKm = haversineKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    if (!best || d < best.d) best = { d, along: cum + segKm * t };
    cum += segKm;
  }
  return { alongKm: best ? best.along : 0, totalKm: cum };
}

// Route start→dest; returns the polyline + road distance. Falls back internally
// to a straight line if routing is unavailable, so it always yields points.
async function plotRoute(oLat, oLng, dLat, dLng) {
  let points = []; let routeKm = 0;
  try {
    const path = await buildFlightPath({ originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng });
    points = Array.isArray(path?.points) ? path.points : [];
    routeKm = Number(path?.distanceKm) || 0;
  } catch { /* fall through */ }
  if (points.length < 2) {
    points = [[oLat, oLng], [dLat, dLng]];
  }
  if (!routeKm) routeKm = polylineKm(points) || haversineKm(oLat, oLng, dLat, dLng) * ROAD_FACTOR;
  return { points, routeKm };
}

function etaFor(routeKm, transport) {
  return Math.max(MIN_ETA_SECONDS, Math.round((routeKm / transportKmh(transport)) * 3600));
}

// Reverse-geocode a point to its street name (Nominatim). Best-effort.
async function reverseStreet(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&addressdetails=1`
      + `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SneakyStuff/1.0 (on-my-way narration)', 'Accept-Language': 'en-GB' },
    });
    if (!res.ok) return null;
    const a = (await res.json())?.address ?? {};
    return a.road || a.pedestrian || a.footway || a.cycleway || a.neighbourhood || a.suburb || null;
  } catch { return null; }
}

// Refresh the trip's street cache (throttled, background) and return the current
// raw street name, e.g. "Hills Road" ('' until the first one resolves).
function currentStreet(tripId, lat, lng) {
  if (lat != null && lng != null) {
    const cached = streetCache.get(tripId);
    if (!cached || Date.now() - cached.at >= GEO_THROTTLE_MS) {
      streetCache.set(tripId, { at: Date.now(), street: cached?.street || '' });
      reverseStreet(lat, lng)
        .then((name) => { if (name) streetCache.set(tripId, { at: Date.now(), street: name }); })
        .catch(() => {});
    }
  }
  return streetCache.get(tripId)?.street || '';
}

// Subject contraction for the narration copy, by pronoun.
function contraction(pronoun) {
  if (pronoun === 'he') return "he's";
  if (pronoun === 'she') return "she's";
  return "they're";
}

// The narration line under the title, banded by how far along the route the
// traveller is. Locations come from the live reverse-geocode; pronoun makes it
// read right for whoever is travelling.
function narration(progress, street, pronoun = 'they') {
  const loc = street || 'the road';
  const subj = contraction(pronoun);
  if (progress >= 0.90) return `hold onto your butt cheeks, ${subj} on ${loc}`;
  if (progress >= 0.75) return `a lil' sweaty on ${loc}`;
  if (progress >= 0.50) return `last seen ripping along ${loc}`;
  if (progress >= 0.25) return `okay, ${subj} currently on ${loc}`;
  return 'Wait and save? I think not.';
}

// How many of the three nodes this progress (0..1) has passed.
function phaseFor(progress) {
  let phase = 0;
  for (const f of WAYPOINT_FRACS) if (progress >= f) phase += 1;
  return phase;
}

// Assemble the content-state for a trip at a given distance progress.
function buildState(trip, { progress = 0, message = '', arrived = false } = {}) {
  const startedAtMs = new Date(trip.started_at).getTime();
  const etaAtMs = startedAtMs + (Number(trip.eta_seconds) || MIN_ETA_SECONDS) * 1000;
  const p = arrived ? 1 : Math.max(0, Math.min(1, progress));
  const phase = arrived ? 4 : phaseFor(p);
  const totalKm = Number(trip.distance_total_km) || 0;
  return omwContentState({
    startedAtMs, etaAtMs, progress: p,
    remainingKm: Math.max(0, totalKm * (1 - p)),
    message: arrived ? '' : message, phase, arrived,
  });
}

// ---------------------------------------------------------------------------
// Quick destinations (up to 3 per user, self-managed on /account)
// ---------------------------------------------------------------------------

export async function listQuickDestinations(accountId) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng, transport
       FROM omw_quick_destinations WHERE account_id = $1 ORDER BY position`,
    [accountId],
  );
  return rows;
}

// A specific quick destination that must belong to the account.
async function getQuickDestination(accountId, id) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng, transport
       FROM omw_quick_destinations WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  );
  return rows[0] ?? null;
}

// The default (position 1) quick destination, or the lowest-positioned one.
async function defaultQuickDestination(accountId) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng, transport
       FROM omw_quick_destinations WHERE account_id = $1 ORDER BY position LIMIT 1`,
    [accountId],
  );
  return rows[0] ?? null;
}

// Upsert one of the caller's 3 slots.
export async function setQuickDestination(accountId, position, { label, lat, lng, transport }) {
  const pos = Number(position);
  if (!(pos >= 1 && pos <= 3)) { const e = new Error('position must be 1–3'); e.statusCode = 400; throw e; }
  if (!label || lat == null || lng == null) { const e = new Error('label, lat and lng are required'); e.statusCode = 400; throw e; }
  const { rows } = await query(
    `INSERT INTO omw_quick_destinations (account_id, position, label, lat, lng, transport)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (account_id, position) DO UPDATE SET
       label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       transport = EXCLUDED.transport, updated_at = NOW()
     RETURNING id, position, label, lat, lng, transport`,
    [accountId, pos, label, Number(lat), Number(lng), normTransport(transport)],
  );
  return rows[0];
}

export async function deleteQuickDestination(accountId, position) {
  await query(`DELETE FROM omw_quick_destinations WHERE account_id = $1 AND position = $2`, [accountId, Number(position)]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Live Activity push tokens (separate table from the scroll tokens)
// ---------------------------------------------------------------------------

export async function saveOmwToken({ accountId, kind, tripId = null, token }) {
  if (!token) return;
  await query(
    `INSERT INTO omw_activity_tokens (account_id, kind, trip_id, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
       SET account_id = EXCLUDED.account_id, kind = EXCLUDED.kind,
           trip_id = EXCLUDED.trip_id, updated_at = NOW()`,
    [accountId, kind, tripId, token],
  );
}

async function ptsTokenFor(accountId) {
  const { rows } = await query(
    `SELECT token FROM omw_activity_tokens
      WHERE account_id = $1 AND kind = 'pts' ORDER BY updated_at DESC LIMIT 1`,
    [accountId],
  );
  return rows[0]?.token || null;
}

async function updateTokensFor(tripId) {
  const { rows } = await query(
    `SELECT token FROM omw_activity_tokens WHERE trip_id = $1 AND kind = 'update'`,
    [tripId],
  );
  return rows.map((r) => r.token);
}

async function pushTripState(trip, { event = 'update', state, alert, dismissalMs } = {}) {
  if (trip.la_channel_id) {
    await sendBroadcast(trip.la_channel_id, { event, contentState: state, alert, dismissalMs });
    return;
  }
  const tokens = await updateTokensFor(trip.id);
  for (const token of tokens) {
    /* eslint-disable no-await-in-loop */
    await sendLiveActivityPush(token, { event, contentState: state, alert, dismissalMs, attributesType: ATTR_TYPE });
    /* eslint-enable no-await-in-loop */
  }
}

// ---------------------------------------------------------------------------
// Trips
// ---------------------------------------------------------------------------

// Start a trip from the traveller's current position. Plots the route from the
// live origin to their destination, so pacing is correct even if they're setting
// off from somewhere other than their usual start. `transport` overrides the
// route default for this trip (sprite + ETA). Loops back to traveller for v1.
export async function startTrip({ travellerId, origin = {}, destId, transport, simulate = true }) {
  const chosen = destId
    ? await getQuickDestination(travellerId, destId)
    : await defaultQuickDestination(travellerId);
  if (!chosen) {
    const e = new Error('No quick destination set (add one on your Account page)'); e.statusCode = 400; throw e;
  }
  if (origin.lat == null || origin.lng == null) {
    const e = new Error('origin {lat,lng} required'); e.statusCode = 400; throw e;
  }

  await cancelActiveTrips(travellerId);

  const mode = normTransport(transport ?? chosen.transport ?? DEFAULT_TRANSPORT);
  const dest = { label: chosen.label, lat: chosen.lat, lng: chosen.lng };
  const { points, routeKm } = await plotRoute(origin.lat, origin.lng, dest.lat, dest.lng);
  const etaSeconds = etaFor(routeKm, mode);
  const viewerId = travellerId; // v1: self-test loop-back.
  const info = await travellerInfo(travellerId);

  const { rows } = await query(
    `INSERT INTO omw_trips
       (traveller_id, viewer_id, simulated, traveller_pronoun, transport, origin_lat, origin_lng,
        dest_label, dest_lat, dest_lng, current_lat, current_lng, route_points,
        distance_total_km, distance_remaining_km, eta_seconds, progress, phase, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$6,$7,$11::jsonb,$12,$12,$13,0,0,'active')
     RETURNING *`,
    [travellerId, viewerId, !!simulate, info.pronoun, mode, origin.lat, origin.lng,
      dest.label, dest.lat, dest.lng, JSON.stringify(points), routeKm, etaSeconds],
  );
  const trip = rows[0];

  await startLiveActivityFor(trip).catch(() => {});
  return trip;
}

async function startLiveActivityFor(trip) {
  try {
    if (await isMuted(trip.viewer_id)) return;
    const token = await ptsTokenFor(trip.viewer_id);
    if (!token) return;

    const traveller = await travellerName(trip.traveller_id);

    let channelId = null;
    try { channelId = await createBroadcastChannel(); } catch { /* fall back to tokens */ }
    if (channelId) {
      await query(`UPDATE omw_trips SET la_channel_id = $1 WHERE id = $2`, [channelId, trip.id]).catch(() => {});
      trip.la_channel_id = channelId;
    }

    await sendLiveActivityPush(token, {
      event: 'start',
      channelId,
      attributesType: ATTR_TYPE,
      contentState: buildState(trip, { progress: 0, message: narration(0, '', trip.traveller_pronoun) }),
      attributes: {
        travellerName: traveller,
        destLabel: trip.dest_label || '',
        transport: normTransport(trip.transport),
        tripId: trip.id,
      },
      alert: {
        title: `${traveller} will be with you soon`,
        body: 'Wait and save? I think not.',
      },
    });
    if (!channelId) setTimeout(() => { sendSilentWake(trip.viewer_id).catch(() => {}); }, 3000);
  } catch { /* best effort */ }
}

async function finaliseArrival(trip) {
  streetCache.delete(trip.id);
  const traveller = await travellerName(trip.traveller_id);
  const muted = await isMuted(trip.viewer_id);
  const alert = muted ? undefined : { title: `${traveller} has arrived`, body: 'Wait and save? I think not.' };
  await pushTripState(trip, { event: 'update', state: buildState(trip, { arrived: true }), alert });
  await query(`UPDATE omw_trips SET status = 'arrived', progress = 1, phase = 4, ended_at = NOW() WHERE id = $1`, [trip.id]);
  setTimeout(() => { endLiveActivity(trip, Date.now()).catch(() => {}); }, ARRIVE_LINGER_MS);
}

// Record a location ping: project onto the route for distance progress, refresh
// the street, check arrival, push. Progress is monotonic (never slips back on a
// deviation). Only the trip's own traveller may ping it.
export async function recordPing({ tripId, travellerId, lat, lng }) {
  const { rows } = await query(
    `SELECT * FROM omw_trips WHERE id = $1 AND traveller_id = $2 AND status = 'active'`,
    [tripId, travellerId],
  );
  const trip = rows[0];
  if (!trip) return { ok: false };
  if (lat == null || lng == null) return { ok: false };

  // Distance progress from projection onto the route; fall back to straight-line
  // toward the destination if the route polyline is somehow missing.
  const totalKm = Number(trip.distance_total_km) || 0;
  let progress;
  const proj = alongRouteKm(trip.route_points, lat, lng);
  if (proj && proj.totalKm > 0) {
    progress = proj.alongKm / proj.totalKm;
  } else {
    const straight = haversineKm(trip.origin_lat, trip.origin_lng, trip.dest_lat, trip.dest_lng) || totalKm;
    progress = straight > 0 ? 1 - haversineKm(lat, lng, trip.dest_lat, trip.dest_lng) / straight : 0;
  }
  progress = Math.max(0, Math.min(1, progress));
  // Monotonic: keep the furthest-reached progress even if a wobble projects back.
  progress = Math.max(progress, Number(trip.progress) || 0);

  const remainingToDest = haversineKm(lat, lng, trip.dest_lat, trip.dest_lng);
  const arrived = remainingToDest <= ARRIVE_KM || progress >= 0.999;
  const phase = arrived ? 4 : phaseFor(progress);
  const message = narration(progress, currentStreet(tripId, lat, lng), trip.traveller_pronoun);

  await query(
    `UPDATE omw_trips SET current_lat = $1, current_lng = $2, distance_remaining_km = $3,
            progress = $4, phase = $5, last_ping_at = NOW() WHERE id = $6`,
    [lat, lng, Math.max(0, totalKm * (1 - progress)), arrived ? 1 : progress, phase, tripId],
  );

  if (arrived) { await finaliseArrival(trip); return { ok: true, arrived: true, progress: 1 }; }

  await pushTripState(trip, { event: 'update', state: buildState(trip, { progress, message }) });
  return { ok: true, arrived: false, progress };
}

async function endLiveActivity(trip, dismissalMs) {
  await pushTripState(trip, { event: 'end', state: buildState(trip, { arrived: true }), dismissalMs });
  if (trip.la_channel_id) deleteBroadcastChannel(trip.la_channel_id).catch(() => {});
}

export async function cancelTrip({ tripId, travellerId }) {
  const { rows } = await query(
    `UPDATE omw_trips SET status = 'cancelled', ended_at = NOW()
      WHERE id = $1 AND traveller_id = $2 AND status = 'active' RETURNING *`,
    [tripId, travellerId],
  );
  const trip = rows[0];
  if (trip) { streetCache.delete(tripId); await endLiveActivity(trip, Date.now()).catch(() => {}); }
  return { ok: true };
}

async function cancelActiveTrips(travellerId) {
  const { rows } = await query(
    `UPDATE omw_trips SET status = 'cancelled', ended_at = NOW()
      WHERE traveller_id = $1 AND status = 'active' RETURNING *`,
    [travellerId],
  );
  for (const trip of rows) {
    /* eslint-disable no-await-in-loop */
    streetCache.delete(trip.id);
    await endLiveActivity(trip, Date.now()).catch(() => {});
    /* eslint-enable no-await-in-loop */
  }
}

async function travellerInfo(accountId) {
  const { rows } = await query(`SELECT name, username, pronoun FROM accounts WHERE id = $1`, [accountId]);
  const r = rows[0] || {};
  return { name: r.name || r.username || 'Someone', pronoun: r.pronoun || 'they' };
}

async function travellerName(accountId) {
  return (await travellerInfo(accountId)).name;
}

// Safety net: cancel trips that have gone quiet for 30 min so a forgotten banner
// doesn't linger forever.
export async function sweepStaleTrips() {
  const { rows } = await query(
    `UPDATE omw_trips SET status = 'cancelled', ended_at = NOW()
      WHERE status = 'active'
        AND started_at < NOW() - interval '30 minutes'
        AND (last_ping_at IS NULL OR last_ping_at < NOW() - interval '30 minutes')
      RETURNING *`,
  );
  for (const trip of rows) {
    /* eslint-disable no-await-in-loop */
    streetCache.delete(trip.id);
    await endLiveActivity(trip, Date.now()).catch(() => {});
    /* eslint-enable no-await-in-loop */
  }
  return rows.length;
}
