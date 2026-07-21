import { query } from '../../db.js';
import { isMuted } from '../notifications/push.js';
import {
  sendLiveActivityPush, omwContentState,
  createBroadcastChannel, deleteBroadcastChannel, sendBroadcast, sendSilentWake,
} from '../notifications/apns.js';
import { buildFlightPath } from '../scrolls/flightPath.js';
import { findOtherUser } from '../chat/chat.repo.js';

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
// its real average with stops isn't far above cycling). `uber` is Katie's only
// mode; its effective door-to-door average allows for pickup wait + traffic.
// Nudge any to taste.
const TRANSPORT_KMH = { bicycle: 16, scooter: 18, uber: 24 };
const DEFAULT_TRANSPORT = 'bicycle';
function transportKmh(t) { return TRANSPORT_KMH[t] || TRANSPORT_KMH[DEFAULT_TRANSPORT]; }
function normTransport(t) { return TRANSPORT_KMH[t] ? t : DEFAULT_TRANSPORT; }
// Straight-line → road padding when routing is unavailable (roads wind).
const ROAD_FACTOR = 1.3;
// ETA display floor.
const MIN_ETA_SECONDS = 60;
// Treat the traveller as arrived within this straight-line distance of the
// destination COORDINATE (~90 m) — works even if the point isn't on a street.
const ARRIVE_KM = 0.09;
// Seconds the "arrived" state lingers before the banner dismisses itself.
const ARRIVE_LINGER_MS = 6000;
// Reverse-geocode at most once every 12s per trip (Nominatim asks for ≤1 req/s).
const GEO_THROTTLE_MS = 12_000;
// If the traveller strays more than this from the plotted route, re-plot from
// where they actually are (handles taking a different way).
const REROUTE_DEV_KM = 0.07;
// Don't re-plot more than once every 20s (OSRM is a shared public server).
const REROUTE_MIN_MS = 20_000;
// Coalesce Live Activity pushes to at most this often (Apple throttles frequent
// pushes → the "hang then jolt" bursts). Band changes + arrival push immediately.
const PUSH_MIN_MS = 9_000;

// In-memory caches per trip.
const streetCache = new Map();       // tripId -> { at, street }
const lastReroute = new Map();       // tripId -> ms of last replot
const lastPush = new Map();          // tripId -> { at, band }

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

// Project (lat,lng) onto the route polyline and return
// { alongKm, totalKm, deviationKm }: how far along the route the nearest point
// sits, and how far off the route the traveller actually is (for reroute checks).
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
    if (!best || d < best.d) {
      best = { d, along: cum + segKm * t, projLat: cy, projLng: cx / k };
    }
    cum += segKm;
  }
  if (!best) return { alongKm: 0, totalKm: cum, deviationKm: 0 };
  const deviationKm = haversineKm(lat, lng, best.projLat, best.projLng);
  return { alongKm: best.along, totalKm: cum, deviationKm };
}

// Public OSRM instances (FOSSGIS, no API key) with real per-mode profiles.
// Bicycle/scooter route on the bike profile (cycle paths, contraflows, cut-
// throughs); Uber on the car profile. The "/driving/" path segment is just
// OSRM's API shape — the instance sets the profile.
const OSRM_BIKE = 'https://routing.openstreetmap.de/routed-bike';
const OSRM_CAR = 'https://routing.openstreetmap.de/routed-car';
function osrmHostFor(transport) { return transport === 'uber' ? OSRM_CAR : OSRM_BIKE; }

// Route start→dest on the profile for `transport`; returns the polyline + road
// distance. Falls back to the car OSRM demo, then a straight line, so it always
// yields points.
async function plotRoute(oLat, oLng, dLat, dLng, transport = DEFAULT_TRANSPORT) {
  try {
    const url = `${osrmHostFor(transport)}/route/v1/driving/${oLng},${oLat};${dLng},${dLat}`
      + `?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'SneakyStuff/1.0 (on-my-way)' } });
    clearTimeout(timeout);
    if (res.ok) {
      const route = (await res.json())?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        const points = coords.map(([lng, lat]) => [lat, lng]);
        const routeKm = (Number(route.distance) || 0) / 1000 || polylineKm(points);
        return { points, routeKm };
      }
    }
  } catch { /* fall through */ }

  // Fallback: the crow's car OSRM demo, then a straight line.
  try {
    const path = await buildFlightPath({ originLat: oLat, originLng: oLng, destLat: dLat, destLng: dLng });
    if (Array.isArray(path?.points) && path.points.length >= 2) {
      return { points: path.points, routeKm: Number(path.distanceKm) || polylineKm(path.points) };
    }
  } catch { /* fall through */ }

  const points = [[oLat, oLng], [dLat, dLng]];
  return { points, routeKm: haversineKm(oLat, oLng, dLat, dLng) * ROAD_FACTOR };
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

// Pronoun helpers so the copy reads right for whoever is travelling.
function contraction(p) { return p === 'he' ? "he's" : p === 'she' ? "she's" : "they're"; }
function possessive(p) { return p === 'he' ? 'his' : p === 'she' ? 'her' : 'their'; }
function subjectPronoun(p) { return p === 'he' ? 'he' : p === 'she' ? 'she' : 'they'; }
function objectPronoun(p) { return p === 'he' ? 'him' : p === 'she' ? 'her' : 'them'; }
function comesVerb(p) { return p === 'they' ? 'come' : 'comes'; }

// A random subtitle shown once they've arrived. Pronoun-aware.
function arrivalSubtitle(pronoun = 'they') {
  const subj = contraction(pronoun);
  const name = subjectPronoun(pronoun);
  const obj = objectPronoun(pronoun);
  const options = [
    `What are you waiting for? Let ${obj} in already.`,
    `I bet ${subj} dying for a cup of tea...`,
    `I bet ${name} can't wait to give you a good sniff...`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// Fill a narration template (pronoun + location), then capitalise the first
// letter so every line reads as a proper sentence.
function fillLine(t, loc, pronoun) {
  const s = t
    .replaceAll('{subj}', contraction(pronoun))
    .replaceAll('{name}', subjectPronoun(pronoun))
    .replaceAll('{obj}', objectPronoun(pronoun))
    .replaceAll('{poss}', possessive(pronoun))
    .replaceAll('{comes}', comesVerb(pronoun))
    .replaceAll('{loc}', loc);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// En-route narration pools, banded by how far along the route the traveller is.
// Several variants per band; one is picked at random each update (never the same
// twice running for a trip) so the copy stays fresh. Transport-flavoured.
const ACTIVE_BANDS = {
  start: 'wait and save? I think not.',
  q1: [
    'okay, {subj} currently on {loc}',
    'underway, somewhere near {loc}',
    'rolling out along {loc}',
    'just spotted around {loc}',
  ],
  q2: [
    'last seen ripping along {loc}',
    'swooshing past {loc}',
    'making good time down {loc}',
    'somewhere near {loc}',
  ],
  q3: [
    "a lil' sweaty on {loc}",
    '{subj} on {loc}, so best get the kettle on..',
    'getting close, over by {loc}',
    'nearly there, just on {loc}',
  ],
  final: [
    'hold onto your butt cheeks, {subj} on {loc}',
    'any second now — {subj} on {loc}',
    'almost at the door, {subj} on {loc}',
  ],
};
const UBER_BANDS = {
  start: 'oh boy, {subj} on {poss} way',
  q1: [
    '{subj} tootling along {loc}',
    'gliding toward {loc}',
    'in the cab near {loc}',
  ],
  q2: [
    'swooshing down {loc}',
    'cruising along {loc}',
    'sailing past {loc}',
  ],
  q3: [
    'sailing merrily along {loc}',
    '{subj} on {loc}, so best get the kettle on..',
    'nearly at the door, by {loc}',
  ],
  final: [
    'here {name} {comes}.. unlatch the door',
    'pulling up any second — here {name} {comes}',
  ],
};

const lastVariant = new Map(); // `${tripId}:${band}` -> last template used

function pickVariant(tripId, band, pool) {
  if (pool.length <= 1) return pool[0];
  const key = `${tripId}:${band}`;
  const last = lastVariant.get(key);
  const choices = last ? pool.filter((t) => t !== last) : pool;
  const pick = choices[Math.floor(Math.random() * choices.length)];
  lastVariant.set(key, pick);
  return pick;
}

function bandFor(progress) {
  if (progress >= 0.90) return 'final';
  if (progress >= 0.75) return 'q3';
  if (progress >= 0.50) return 'q2';
  if (progress >= 0.25) return 'q1';
  return 'start';
}

// The narration line under the title: banded by progress, pronoun aware,
// capitalised, and varied per update. `tripId` scopes the anti-repeat memory.
function narration(progress, street, pronoun = 'they', transport = 'bicycle', tripId = '') {
  const loc = street || 'the road';
  const bands = transport === 'uber' ? UBER_BANDS : ACTIVE_BANDS;
  const band = bandFor(progress);
  if (band === 'start') return fillLine(bands.start, loc, pronoun);
  return fillLine(pickVariant(tripId, band, bands[band]), loc, pronoun);
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
    message, phase, arrived,
  });
}

// ---------------------------------------------------------------------------
// Quick destinations (up to 3 per user, self-managed on /account)
// ---------------------------------------------------------------------------

export async function listQuickDestinations(accountId) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng
       FROM omw_quick_destinations WHERE account_id = $1 ORDER BY position`,
    [accountId],
  );
  return rows;
}

// A specific quick destination that must belong to the account.
async function getQuickDestination(accountId, id) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng
       FROM omw_quick_destinations WHERE account_id = $1 AND id = $2`,
    [accountId, id],
  );
  return rows[0] ?? null;
}

// The default (position 1) quick destination, or the lowest-positioned one.
async function defaultQuickDestination(accountId) {
  const { rows } = await query(
    `SELECT id, position, label, lat, lng
       FROM omw_quick_destinations WHERE account_id = $1 ORDER BY position LIMIT 1`,
    [accountId],
  );
  return rows[0] ?? null;
}

// Upsert one of the caller's 3 slots.
export async function setQuickDestination(accountId, position, { label, lat, lng }) {
  const pos = Number(position);
  if (!(pos >= 1 && pos <= 3)) { const e = new Error('position must be 1–3'); e.statusCode = 400; throw e; }
  if (!label || lat == null || lng == null) { const e = new Error('label, lat and lng are required'); e.statusCode = 400; throw e; }
  const { rows } = await query(
    `INSERT INTO omw_quick_destinations (account_id, position, label, lat, lng)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (account_id, position) DO UPDATE SET
       label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = NOW()
     RETURNING id, position, label, lat, lng`,
    [accountId, pos, label, Number(lat), Number(lng)],
  );
  return rows[0];
}

export async function deleteQuickDestination(accountId, position) {
  await query(`DELETE FROM omw_quick_destinations WHERE account_id = $1 AND position = $2`, [accountId, Number(position)]);
  return { ok: true };
}

// Current transport — a single per-user setting used by every triggered journey.
// Fail-safe: if the column isn't there yet (migration lag), default rather than throw.
export async function getCurrentTransport(accountId) {
  try {
    const { rows } = await query(`SELECT omw_transport FROM accounts WHERE id = $1`, [accountId]);
    return normTransport(rows[0]?.omw_transport);
  } catch { return DEFAULT_TRANSPORT; }
}

export async function setCurrentTransport(accountId, transport) {
  const t = normTransport(transport);
  await query(`UPDATE accounts SET omw_transport = $1 WHERE id = $2`, [t, accountId]);
  return { transport: t };
}

// ---------------------------------------------------------------------------
// Feature config — the two-way toggle
// ---------------------------------------------------------------------------

export async function getOmwConfig() {
  try {
    const { rows } = await query(`SELECT live_to_partner FROM omw_config WHERE id = TRUE`);
    return rows[0] ?? { live_to_partner: false };
  } catch { return { live_to_partner: false }; }  // table missing → fail safe to self-loop
}

export async function setOmwConfig({ liveToPartner }) {
  const { rows } = await query(
    `UPDATE omw_config SET live_to_partner = $1, updated_at = NOW() WHERE id = TRUE
     RETURNING live_to_partner`,
    [!!liveToPartner],
  );
  return rows[0] ?? { live_to_partner: !!liveToPartner };
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
export async function startTrip({ travellerId, origin = {}, destId, transport }) {
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

  // Transport is the caller's single "current transport" setting, unless a
  // specific one is passed for this trip.
  const mode = normTransport(transport ?? await getCurrentTransport(travellerId));
  const dest = { label: chosen.label, lat: chosen.lat, lng: chosen.lng };
  const { points, routeKm } = await plotRoute(origin.lat, origin.lng, dest.lat, dest.lng, mode);
  const etaSeconds = etaFor(routeKm, mode);
  const info = await travellerInfo(travellerId);

  // Who sees the activity: self while testing, or the partner once the two-way
  // toggle is flipped. `simulated` stays true only for a self-loop.
  const { live_to_partner: liveToPartner } = await getOmwConfig();
  let viewerId = travellerId;
  if (liveToPartner) {
    const other = await findOtherUser(travellerId);
    if (other) viewerId = other.id;
  }
  const simulateTrip = viewerId === travellerId;

  const { rows } = await query(
    `INSERT INTO omw_trips
       (traveller_id, viewer_id, simulated, traveller_pronoun, transport, origin_lat, origin_lng,
        dest_label, dest_lat, dest_lng, current_lat, current_lng, route_points,
        distance_total_km, distance_remaining_km, eta_seconds, progress, phase, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$6,$7,$11::jsonb,$12,$12,$13,0,0,'active')
     RETURNING *`,
    [travellerId, viewerId, simulateTrip, info.pronoun, mode, origin.lat, origin.lng,
      dest.label, dest.lat, dest.lng, JSON.stringify(points), routeKm, etaSeconds],
  );
  const trip = rows[0];

  // Cold-start the Live Activity on the viewer's device via APNs push-to-start
  // (works with their app closed — the whole point of the feature).
  await startLiveActivityFor(trip).catch((e) => { console.error('[omw] startLiveActivityFor threw', e); });
  return trip;
}

async function startLiveActivityFor(trip) {
  try {
    if (await isMuted(trip.viewer_id)) { console.warn(`[omw] viewer ${trip.viewer_id} muted — no push-to-start`); return; }
    const token = await ptsTokenFor(trip.viewer_id);
    if (!token) {
      console.warn(`[omw] NO push-to-start token for viewer ${trip.viewer_id} — activity cannot cold-start. `
        + `(Device must run the app while signed in, on iOS 17.2+, to register a 'pts' token.)`);
      return;
    }
    console.log(`[omw] push-to-start: trip ${trip.id}, viewer ${trip.viewer_id}, token …${token.slice(-8)}`);

    const traveller = await travellerName(trip.traveller_id);

    let channelId = null;
    try { channelId = await createBroadcastChannel(); } catch { /* fall back to tokens */ }
    if (channelId) {
      await query(`UPDATE omw_trips SET la_channel_id = $1 WHERE id = $2`, [channelId, trip.id]).catch(() => {});
      trip.la_channel_id = channelId;
    }
    console.log(`[omw] broadcast channel ${channelId ? 'created' : 'unavailable (token path)'}`);

    const status = await sendLiveActivityPush(token, {
      event: 'start',
      channelId,
      attributesType: ATTR_TYPE,
      contentState: buildState(trip, { progress: 0, message: narration(0, '', trip.traveller_pronoun, trip.transport, trip.id) }),
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
    console.log(`[omw] push-to-start APNs status: ${status} (200 = accepted)`);
    if (!channelId) setTimeout(() => { sendSilentWake(trip.viewer_id).catch(() => {}); }, 3000);
  } catch (e) { console.error('[omw] startLiveActivityFor error', e); }
}

async function finaliseArrival(trip) {
  streetCache.delete(trip.id); lastReroute.delete(trip.id); lastPush.delete(trip.id);
  lastVariant.delete(`${trip.id}:q1`); lastVariant.delete(`${trip.id}:q2`);
  lastVariant.delete(`${trip.id}:q3`); lastVariant.delete(`${trip.id}:final`);
  const traveller = await travellerName(trip.traveller_id);
  const muted = await isMuted(trip.viewer_id);
  const subtitle = arrivalSubtitle(trip.traveller_pronoun);
  const alert = muted ? undefined : { title: `${traveller} has arrived!`, body: subtitle };
  await pushTripState(trip, { event: 'update', state: buildState(trip, { arrived: true, message: subtitle }), alert });
  await query(`UPDATE omw_trips SET status = 'arrived', progress = 1, phase = 4, ended_at = NOW() WHERE id = $1`, [trip.id]);
  setTimeout(() => { endLiveActivity(trip, Date.now()).catch(() => {}); }, ARRIVE_LINGER_MS);
}

// Record a location ping: measure progress along the plotted route, RE-PLOT if
// the traveller has taken a different way, decide arrival on the destination
// COORDINATE, and push (coalesced so Apple doesn't throttle us into bursts).
// Progress is monotonic. Only the trip's own traveller may ping it.
export async function recordPing({ tripId, travellerId, lat, lng }) {
  const { rows } = await query(
    `SELECT * FROM omw_trips WHERE id = $1 AND traveller_id = $2 AND status = 'active'`,
    [tripId, travellerId],
  );
  const trip = rows[0];
  if (!trip) return { ok: false };
  if (lat == null || lng == null) return { ok: false };

  const now = Date.now();
  const remainingToDest = haversineKm(lat, lng, trip.dest_lat, trip.dest_lng);
  let offset = Number(trip.route_offset_km) || 0;
  let total = Number(trip.distance_total_km) || 0;
  let proj = alongRouteKm(trip.route_points, lat, lng);
  let along = proj ? proj.alongKm : 0;
  if (proj && (!total || total <= 0)) total = offset + proj.totalKm;

  // Reroute: gone off the plotted line by more than the threshold → re-plot from
  // here to the destination, carrying the distance already covered so the bar
  // doesn't jump. Skipped near the destination and rate-limited.
  const deviated = proj && proj.deviationKm > REROUTE_DEV_KM;
  const canReroute = now - (lastReroute.get(tripId) || 0) > REROUTE_MIN_MS;
  if (deviated && remainingToDest > ARRIVE_KM * 3 && canReroute) {
    lastReroute.set(tripId, now);
    const covered = offset + along;
    const replot = await plotRoute(lat, lng, trip.dest_lat, trip.dest_lng, trip.transport);
    offset = covered;
    total = covered + replot.routeKm;
    along = 0;
    trip.route_points = replot.points;
    await query(
      `UPDATE omw_trips SET route_points = $1::jsonb, route_offset_km = $2, distance_total_km = $3 WHERE id = $4`,
      [JSON.stringify(replot.points), offset, total, tripId],
    ).catch(() => {});
  }

  // Fallback if we have no usable route at all: straight-line toward the dest.
  let progress;
  if (total > 0) {
    progress = (offset + along) / total;
  } else {
    const straight = haversineKm(trip.origin_lat, trip.origin_lng, trip.dest_lat, trip.dest_lng) || 1;
    progress = 1 - remainingToDest / straight;
  }
  progress = Math.max(0, Math.min(1, progress));
  progress = Math.max(progress, Number(trip.progress) || 0);   // monotonic

  // Arrival is purely proximity to the destination coordinate (no street needed).
  const arrived = remainingToDest <= ARRIVE_KM || progress >= 0.999;
  const phase = arrived ? 4 : phaseFor(progress);

  await query(
    `UPDATE omw_trips SET current_lat = $1, current_lng = $2, distance_remaining_km = $3,
            progress = $4, phase = $5, last_ping_at = NOW() WHERE id = $6`,
    [lat, lng, Math.max(0, total * (1 - progress)), arrived ? 1 : progress, phase, tripId],
  );

  if (arrived) { await finaliseArrival(trip); return { ok: true, arrived: true, progress: 1 }; }

  // Coalesce pushes: only when the phase band changes, or every PUSH_MIN_MS,
  // whichever comes first. This keeps us under Apple's update throttle so the bar
  // moves steadily instead of hanging then jolting.
  const band = bandFor(progress);
  const prev = lastPush.get(tripId) || { at: 0, band: null };
  if (band !== prev.band || now - prev.at >= PUSH_MIN_MS) {
    lastPush.set(tripId, { at: now, band });
    const message = narration(progress, currentStreet(tripId, lat, lng), trip.traveller_pronoun, trip.transport, tripId);
    await pushTripState(trip, { event: 'update', state: buildState(trip, { progress, message }) });
  }
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
  try {
    const { rows } = await query(`SELECT name, username, pronoun FROM accounts WHERE id = $1`, [accountId]);
    const r = rows[0] || {};
    return { name: r.name || r.username || 'Someone', pronoun: r.pronoun || 'they' };
  } catch {
    // pronoun column may be missing pre-migration — fall back without it.
    try {
      const { rows } = await query(`SELECT name, username FROM accounts WHERE id = $1`, [accountId]);
      const r = rows[0] || {};
      return { name: r.name || r.username || 'Someone', pronoun: 'they' };
    } catch { return { name: 'Someone', pronoun: 'they' }; }
  }
}


async function travellerName(accountId) {
  return (await travellerInfo(accountId)).name;
}

// Admin "kill switch": cancel EVERY active trip (all users), dismiss their Live
// Activities, and tear down their broadcast channels. Use to clear zombie trips.
export async function cancelAllActiveTrips() {
  const { rows } = await query(
    `UPDATE omw_trips SET status = 'cancelled', ended_at = NOW()
      WHERE status = 'active' RETURNING *`,
  );
  for (const trip of rows) {
    /* eslint-disable no-await-in-loop */
    streetCache.delete(trip.id);
    await endLiveActivity(trip, Date.now()).catch(() => {});
    /* eslint-enable no-await-in-loop */
  }
  return rows.length;
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
