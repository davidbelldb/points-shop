import { query } from '../../db.js';
import { isMuted } from '../notifications/push.js';
import {
  sendLiveActivityPush, omwContentState,
  createBroadcastChannel, deleteBroadcastChannel, sendBroadcast, sendSilentWake,
} from '../notifications/apns.js';

/*
 * "On My Way" — live-location Live Activity.
 *
 * A traveller triggers a trip from their current position; the server tracks
 * their progress toward a fixed destination and pushes it to the Live Activity.
 * v1 is a self-test: the trip loops back to the traveller's own device
 * (viewer_id = traveller_id), so David can watch his own OMW banner move.
 *
 * Progress is GPS-driven: every location ping recomputes the straight-line
 * distance remaining, so `progress = 1 - remaining/total`. Cheap (no routing
 * API per ping) and monotonic enough for a believable bar + three waypoint pops.
 */

const ATTR_TYPE = 'OmwActivityAttributes';

// The three waypoint nodes sit at these fractions — same geometry the widget
// draws. A node "pops" once progress passes its fraction.
const WAYPOINT_FRACS = [0.25, 0.5, 0.75];
// Treat the traveller as arrived within this straight-line distance (~80 m).
const ARRIVE_KM = 0.08;
// Seconds the "arrived" state lingers before the banner dismisses itself.
const ARRIVE_LINGER_MS = 6000;

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

// How many of the three waypoint nodes this progress has passed (0–3).
function phaseFor(progress) {
  let phase = 0;
  for (const f of WAYPOINT_FRACS) if (progress >= f) phase += 1;
  return phase;
}

// ---------------------------------------------------------------------------
// Destinations (per-account, admin-managed)
// ---------------------------------------------------------------------------

export async function listDestinations() {
  const { rows } = await query(
    `SELECT a.id AS account_id, a.username, a.name, a.role,
            d.label, d.lat, d.lng, d.updated_at
       FROM accounts a
       LEFT JOIN omw_destinations d ON d.account_id = a.id
      ORDER BY a.role DESC, a.username ASC`,
  );
  return rows;
}

export async function getDestination(accountId) {
  const { rows } = await query(
    `SELECT account_id, label, lat, lng FROM omw_destinations WHERE account_id = $1`,
    [accountId],
  );
  return rows[0] ?? null;
}

export async function setDestination(accountId, { label, lat, lng }) {
  if (!label || lat == null || lng == null) {
    const e = new Error('label, lat and lng are required'); e.statusCode = 400; throw e;
  }
  const { rows } = await query(
    `INSERT INTO omw_destinations (account_id, label, lat, lng)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id) DO UPDATE
       SET label = EXCLUDED.label, lat = EXCLUDED.lat, lng = EXCLUDED.lng, updated_at = NOW()
     RETURNING account_id, label, lat, lng`,
    [accountId, label, Number(lat), Number(lng)],
  );
  return rows[0];
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

// Push the current trip state to whichever transport we have — broadcast
// channel first (reaches a closed app), else per-activity update tokens.
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

// Start a trip from the traveller's current position toward their configured
// destination. Loops back to the traveller for v1 (viewer = traveller).
export async function startTrip({ travellerId, origin = {}, simulate = true }) {
  const dest = await getDestination(travellerId);
  if (!dest) { const e = new Error('No destination set for this account (set one in Admin → On My Way)'); e.statusCode = 400; throw e; }
  if (origin.lat == null || origin.lng == null) {
    const e = new Error('origin {lat,lng} required'); e.statusCode = 400; throw e;
  }

  // One active trip at a time — cancel any stragglers first.
  await cancelActiveTrips(travellerId);

  const totalKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const viewerId = travellerId; // v1: self-test loop-back.

  const { rows } = await query(
    `INSERT INTO omw_trips
       (traveller_id, viewer_id, simulated, origin_lat, origin_lng,
        dest_label, dest_lat, dest_lng, current_lat, current_lng,
        distance_total_km, distance_remaining_km, progress, phase, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$4,$5,$9,$9,0,0,'active')
     RETURNING *`,
    [travellerId, viewerId, !!simulate, origin.lat, origin.lng,
      dest.label, dest.lat, dest.lng, totalKm],
  );
  const trip = rows[0];

  // Fire the Live Activity on the viewer's device (push-to-start, app-closed OK).
  await startLiveActivityFor(trip).catch(() => {});
  return trip;
}

async function startLiveActivityFor(trip) {
  try {
    if (await isMuted(trip.viewer_id)) return;
    const token = await ptsTokenFor(trip.viewer_id);
    if (!token) return;

    const traveller = await travellerName(trip.traveller_id);
    const startedAtMs = new Date(trip.started_at).getTime();

    // Broadcast channel so live updates reach the app even when closed.
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
      contentState: omwContentState({
        startedAtMs, etaAtMs: startedAtMs, progress: 0,
        remainingKm: Number(trip.distance_total_km) || 0, phase: 0, arrived: false,
      }),
      attributes: {
        travellerName: traveller,
        destLabel: trip.dest_label || '',
        tripId: trip.id,
      },
      alert: {
        title: `${traveller} is on his way and will be with you soon`,
        body: 'Wait and save? I think not.',
      },
    });
    // Nudge the app awake to capture the update token when there's no channel.
    if (!channelId) setTimeout(() => { sendSilentWake(trip.viewer_id).catch(() => {}); }, 3000);
  } catch { /* best effort */ }
}

// Record a location ping: recompute remaining/progress/phase, push the update,
// and finalise on arrival. Only the trip's own traveller may ping it.
export async function recordPing({ tripId, travellerId, lat, lng }) {
  const { rows } = await query(
    `SELECT * FROM omw_trips WHERE id = $1 AND traveller_id = $2 AND status = 'active'`,
    [tripId, travellerId],
  );
  const trip = rows[0];
  if (!trip) return { ok: false };
  if (lat == null || lng == null) return { ok: false };

  const total = Number(trip.distance_total_km) || 0;
  const remaining = haversineKm(lat, lng, trip.dest_lat, trip.dest_lng);
  const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
  const arrived = remaining <= ARRIVE_KM || progress >= 0.999;
  const phase = arrived ? 4 : phaseFor(progress);

  await query(
    `UPDATE omw_trips
        SET current_lat = $1, current_lng = $2, distance_remaining_km = $3,
            progress = $4, phase = $5, last_ping_at = NOW()
      WHERE id = $6`,
    [lat, lng, remaining, progress, phase, tripId],
  );

  const startedAtMs = new Date(trip.started_at).getTime();
  const muted = await isMuted(trip.viewer_id);

  if (arrived) {
    const state = omwContentState({
      startedAtMs, etaAtMs: Date.now(), progress: 1, remainingKm: 0, phase: 4, arrived: true,
    });
    const traveller = await travellerName(trip.traveller_id);
    const alert = muted ? undefined : { title: `${traveller} has arrived`, body: 'Wait and save? I think not.' };
    await pushTripState(trip, { event: 'update', state, alert });
    await query(`UPDATE omw_trips SET status = 'arrived', ended_at = NOW() WHERE id = $1`, [tripId]);
    // Linger on "arrived", then dismiss + tear down the channel.
    setTimeout(() => { endLiveActivity(trip, Date.now()).catch(() => {}); }, ARRIVE_LINGER_MS);
    return { ok: true, arrived: true, progress: 1 };
  }

  const state = omwContentState({
    startedAtMs, etaAtMs: Date.now(), progress, remainingKm: remaining, phase, arrived: false,
  });
  await pushTripState(trip, { event: 'update', state });
  return { ok: true, arrived: false, progress };
}

// End a trip's Live Activity (dismiss the banner + delete the broadcast channel).
async function endLiveActivity(trip, dismissalMs) {
  const state = omwContentState({
    startedAtMs: Date.now() - 1000, etaAtMs: Date.now(), progress: 1, remainingKm: 0, phase: 4, arrived: true,
  });
  await pushTripState(trip, { event: 'end', state, dismissalMs });
  if (trip.la_channel_id) deleteBroadcastChannel(trip.la_channel_id).catch(() => {});
}

// Traveller cancels their trip (or a new one supersedes it).
export async function cancelTrip({ tripId, travellerId }) {
  const { rows } = await query(
    `UPDATE omw_trips SET status = 'cancelled', ended_at = NOW()
      WHERE id = $1 AND traveller_id = $2 AND status = 'active' RETURNING *`,
    [tripId, travellerId],
  );
  const trip = rows[0];
  if (trip) await endLiveActivity(trip, Date.now()).catch(() => {});
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
    await endLiveActivity(trip, Date.now()).catch(() => {});
    /* eslint-enable no-await-in-loop */
  }
}

async function travellerName(accountId) {
  const { rows } = await query(`SELECT name, username FROM accounts WHERE id = $1`, [accountId]);
  return rows[0]?.name || rows[0]?.username || 'Someone';
}

// Safety net: cancel trips that have gone quiet (no ping for 30 min) so a
// forgotten banner doesn't linger forever.
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
    await endLiveActivity(trip, Date.now()).catch(() => {});
    /* eslint-enable no-await-in-loop */
  }
  return rows.length;
}
