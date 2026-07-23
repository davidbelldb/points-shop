import { query, pool } from '../../db.js';
import { sendPush, isMuted } from '../notifications/push.js';
import {
  sendLiveActivityPush, crowContentState, sendSilentWake,
  createBroadcastChannel, deleteBroadcastChannel, sendBroadcast,
} from '../notifications/apns.js';
import { findOtherUser } from '../chat/chat.repo.js';
import { fetchForecastBody } from './forecast.js';

// ---------------------------------------------------------------------------
// Live Activity (crow) push helpers
// ---------------------------------------------------------------------------

/** Upsert a Live Activity token (push-to-start, or per-scroll update). */
export async function saveLiveActivityToken({ accountId, kind, scrollId = null, token }) {
  if (!token) return;
  await query(
    `INSERT INTO live_activity_tokens (account_id, kind, scroll_id, token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE
       SET account_id = EXCLUDED.account_id, kind = EXCLUDED.kind,
           scroll_id = EXCLUDED.scroll_id, updated_at = NOW()`,
    [accountId, kind, scrollId, token],
  );
}

async function ptsTokenFor(accountId) {
  const { rows } = await query(
    `SELECT token FROM live_activity_tokens
      WHERE account_id = $1 AND kind = 'pts' ORDER BY updated_at DESC LIMIT 1`,
    [accountId],
  );
  return rows[0]?.token || null;
}

async function updateTokensFor(scrollId) {
  const { rows } = await query(
    `SELECT token FROM live_activity_tokens WHERE scroll_id = $1 AND kind = 'update'`,
    [scrollId],
  );
  return rows.map((r) => r.token);
}

// Push-to-start the crow activity on the recipient's device (works app-closed).
async function startLiveActivityFor(scroll) {
  try {
    // Respect the recipient's mute window — no new Live Activity while muted.
    if (await isMuted(scroll.recipient_id)) return;
    const token = await ptsTokenFor(scroll.recipient_id);
    if (!token) return;
    const arrivesAtMs = new Date(scroll.deliver_at).getTime();
    const startedAtMs = arrivesAtMs - (Number(scroll.flight_seconds) || 0) * 1000;
    // Create a broadcast channel so live updates + the landing reach the recipient
    // even with their app fully closed (no device-captured token needed). Falls
    // back to the device-token path if channel creation fails.
    let channelId = null;
    try { channelId = await createBroadcastChannel(); } catch { /* fall back */ }
    if (channelId) {
      await query(`UPDATE scrolls SET la_channel_id = $1 WHERE id = $2`, [channelId, scroll.id]).catch(() => {});
    }
    await sendLiveActivityPush(token, {
      event: 'start',
      channelId,
      contentState: crowContentState({
        startedAtMs, arrivesAtMs, landed: false,
        // Forecast scrolls open with their own line before street narration.
        message: scroll.from_label ? 'A Three-Eyed Crow travels south with news' : '',
      }),
      attributes: {
        kind: scroll.from_label ? 'forecast' : 'scroll',
        originLabel: scroll.from_label || scroll.origin_label || 'afar',
        destLabel: scroll.dest_label || '',
        scrollId: scroll.id,
      },
      alert: {
        title: 'A scroll will shortly be arriving.',
        body: scroll.from_label
          ? 'A Three-Eyed Crow travels south with news'
          : `A crow has been dispatched from ${scroll.origin_label || 'afar'}`,
      },
    });
    // Only the device-token fallback needs the app awake; with a channel the
    // updates broadcast regardless, so skip the wake when we have one.
    if (!channelId) setTimeout(() => { sendSilentWake(scroll.recipient_id).catch(() => {}); }, 3000);
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// In-flight subtitle updates — the crow is narrated past Cambridge streets as
// it flies, then "coming into land" near the end. Each scroll advances through
// four phases; `scrolls.la_phase` records the highest phase already pushed so
// we never repeat or go backwards.
// ---------------------------------------------------------------------------

// Cambridge streets with approximate centre coordinates, so the crow can be
// narrated past places that genuinely lie between origin and destination.
const CAMBRIDGE_STREETS = [
  { name: 'Mill Road',           lat: 52.1985, lng: 0.1390 },
  { name: 'Trumpington Street',  lat: 52.2010, lng: 0.1180 },
  { name: "King's Parade",       lat: 52.2042, lng: 0.1175 },
  { name: 'Hills Road',          lat: 52.1930, lng: 0.1370 },
  { name: 'Petty Cury',          lat: 52.2055, lng: 0.1205 },
  { name: 'Regent Street',       lat: 52.2010, lng: 0.1270 },
  { name: 'Castle Street',       lat: 52.2110, lng: 0.1140 },
  { name: 'Newmarket Road',      lat: 52.2120, lng: 0.1500 },
  { name: 'Chesterton Road',     lat: 52.2130, lng: 0.1280 },
  { name: 'Grange Road',         lat: 52.2040, lng: 0.1010 },
  { name: 'Silver Street',       lat: 52.2020, lng: 0.1150 },
  { name: 'Sidney Street',       lat: 52.2070, lng: 0.1210 },
  { name: 'Bridge Street',       lat: 52.2090, lng: 0.1180 },
  { name: 'Magdalene Street',    lat: 52.2095, lng: 0.1160 },
  { name: 'Jesus Lane',          lat: 52.2080, lng: 0.1240 },
  { name: 'Trumpington Road',    lat: 52.1900, lng: 0.1230 },
  { name: 'Madingley Road',      lat: 52.2130, lng: 0.0950 },
  { name: 'East Road',           lat: 52.2055, lng: 0.1340 },
  { name: 'Burleigh Street',     lat: 52.2060, lng: 0.1320 },
  { name: 'Maids Causeway',      lat: 52.2085, lng: 0.1290 },
];

// Deterministic fallback when the scroll has no usable coordinates: three
// distinct streets, stable for the life of one crow.
function pickStreets(scrollId) {
  let h = 0;
  for (const ch of String(scrollId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = CAMBRIDGE_STREETS.map((s) => s.name);
  const picks = [];
  for (let i = 0; i < 3 && pool.length; i += 1) {
    picks.push(pool.splice(h % pool.length, 1)[0]);
    h = (h * 31 + 17) >>> 0;
  }
  return picks;
}

// Reverse-geocode a single point to its street name (Nominatim, same source the
// client uses to pick origin/destination). Returns null on any failure.
async function reverseStreet(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&addressdetails=1`
      + `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SneakyStuff/1.0 (crow flight narration)', 'Accept-Language': 'en-GB' },
    });
    if (!res.ok) return null;
    const a = (await res.json())?.address ?? {};
    return a.road || a.pedestrian || a.footway || a.neighbourhood || a.suburb || null;
  } catch { return null; }
}

// Single source of truth: the three waypoint nodes sit at these fractions of the
// journey. The widget draws nodes here, the geocoder samples streets here, and
// the scheduler fires each node's update as the progress bar reaches it.
const WAYPOINT_FRACS = [0.25, 0.50, 0.75];
// A final "coming into land" beat just before arrival (no node, text only).
const LANDING_FRAC = 0.92;
// Fire each update this far ahead of the bar reaching the mark, to absorb poll +
// push-delivery latency so the node pops exactly as the fill arrives (capped at
// 10% of the flight so short hops don't fire too early).
const LEAD_MS = 1800;

// Sample each waypoint along the origin→dest line and reverse-geocode it, so the
// narrated streets genuinely lie between the two addresses. Stored once on the
// scroll row; the scheduler reads them. Best-effort — never throws.
async function computeRouteStreets(scroll) {
  const aLat = Number(scroll.origin_lat); const aLng = Number(scroll.origin_lng);
  const bLat = Number(scroll.dest_lat); const bLng = Number(scroll.dest_lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return;
  const out = [];
  for (const t of WAYPOINT_FRACS) {
    const lat = aLat + (bLat - aLat) * t;
    const lng = aLng + (bLng - aLng) * t;
    /* eslint-disable no-await-in-loop */
    const name = await reverseStreet(lat, lng);
    // Avoid repeating the previous street back-to-back.
    out.push(name && name !== out[out.length - 1] ? name : null);
    await new Promise((r) => setTimeout(r, 1100)); // honour Nominatim's 1 req/s
    /* eslint-enable no-await-in-loop */
  }
  if (out.some(Boolean)) {
    await query(`UPDATE scrolls SET route_streets = $1 WHERE id = $2`,
      [JSON.stringify(out), scroll.id]).catch(() => {});
  }
}

// The street that best sits at `frac` of the way along the origin→dest line.
// Projects each street onto the segment (lng scaled by cos(lat) so degrees are
// roughly isotropic) and scores by closeness to the target fraction plus how
// far it strays from the flight path. Returns null if coords are unusable.
function routeStreet(scroll, frac) {
  const aLat = Number(scroll.origin_lat); const aLng = Number(scroll.origin_lng);
  const bLat = Number(scroll.dest_lat); const bLng = Number(scroll.dest_lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return null;
  const k = Math.cos((aLat * Math.PI) / 180) || 1;
  const ax = aLng * k; const ay = aLat;
  const dx = bLng * k - ax; const dy = bLat - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return null;
  let best = null;
  for (const s of CAMBRIDGE_STREETS) {
    const px = s.lng * k; const py = s.lat;
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    if (t < 0.05 || t > 0.95) continue;            // must be genuinely en route
    const dist = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    const cost = Math.abs(t - frac) + dist * 4;     // path-proximity weighted
    if (!best || cost < best.cost) best = { name: s.name, cost };
  }
  return best?.name ?? null;
}

// Phases 1–3 narrate the three waypoint streets; phase 4 = landing approach.
const PHASE_FRAC = { 1: WAYPOINT_FRACS[0], 2: WAYPOINT_FRACS[1], 3: WAYPOINT_FRACS[2] };

function streetMessage(phase, scroll) {
  if (phase === 4) return `Coming in to land at ${scroll.dest_label || 'its destination'}`;
  // 1) real reverse-geocoded street on the path, 2) nearest curated street,
  // 3) deterministic Cambridge fallback.
  const routed = Array.isArray(scroll.route_streets) ? scroll.route_streets[phase - 1] : null;
  const street = routed || routeStreet(scroll, PHASE_FRAC[phase]) || pickStreets(scroll.id)[phase - 1];
  switch (phase) {
    case 1: return `Probably somewhere over ${street}`;
    case 2: return `Likely soaring over ${street}`;
    case 3: return `Last spotted over ${street}`;
    default: return '';
  }
}

// Highest phase the crow has "reached" right now, fired LEAD_MS early so the
// node pops as the progress bar's leading edge arrives (not after it passes).
// Marks: the three waypoint nodes, then the landing-approach beat.
function reachedPhase(startedAtMs, arrivesAtMs) {
  const total = Math.max(1, arrivesAtMs - startedAtMs);
  const lead = Math.min(LEAD_MS, total * 0.1);
  const at = Date.now() + lead;
  const marks = [...WAYPOINT_FRACS, LANDING_FRAC];
  let phase = 0;
  for (let i = 0; i < marks.length; i += 1) {
    if (at >= startedAtMs + marks[i] * total) phase = i + 1;
  }
  return phase;
}

// Called on the resolver tick: nudge each in-flight crow's subtitle forward when
// it crosses into a new phase. Only touches scrolls with a live update token.
export async function pushStreetSubtitleUpdates() {
  const { rows } = await query(
    `SELECT s.id, s.recipient_id, s.deliver_at, s.flight_seconds, s.dest_label, s.la_phase,
            s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.route_streets, s.la_channel_id, s.from_label
       FROM scrolls s
      WHERE s.delivered = FALSE AND s.deliver_at > NOW()
        AND (s.la_channel_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM live_activity_tokens t
           WHERE t.scroll_id = s.id AND t.kind = 'update'))`,
  );
  for (const s of rows) {
    try {
      if (await isMuted(s.recipient_id)) continue; // muted → no live narration
      const arrivesAtMs = new Date(s.deliver_at).getTime();
      const startedAtMs = arrivesAtMs - (Number(s.flight_seconds) || 0) * 1000;
      const target = reachedPhase(startedAtMs, arrivesAtMs);
      if (target <= (Number(s.la_phase) || 0)) continue;

      const msg = streetMessage(target, s);
      const state = crowContentState({
        startedAtMs, arrivesAtMs, landed: false, message: msg, phase: target,
      });
      // A little ping/vibration as the crow passes each waypoint.
      const alert = { title: s.from_label ? 'The Three-Eyed Crow' : 'A crow en route', body: msg };
      if (s.la_channel_id) {
        await sendBroadcast(s.la_channel_id, { event: 'update', contentState: state, alert });
      } else {
        const tokens = await updateTokensFor(s.id);
        for (const token of tokens) {
          await sendLiveActivityPush(token, { event: 'update', contentState: state, alert });
        }
      }
      await query(`UPDATE scrolls SET la_phase = $1 WHERE id = $2`, [target, s.id]);
    } catch { /* best effort per scroll */ }
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Daily weather forecast scroll
// ---------------------------------------------------------------------------

// The flight always lands at the configured forecast location; it sets off from
// the Met Office Weather Station, Cambridge (CB24 9NZ — north of the city) so the
// crow genuinely "travels south" with a real journey to narrate.
const FORECAST_ORIGIN = { lat: 52.24543314352076, lng: 0.10027112765321439 };
const FORECAST_ORIGIN_LABEL = 'the Met Office Weather Station, Cambridge';
const FORECAST_FROM_LABEL = 'the Three-Eyed Crow';

export async function getForecastSettings() {
  const { rows } = await query(`SELECT * FROM forecast_settings WHERE id = 1`);
  return rows[0] ?? null;
}

const FORECAST_COLS = new Set(['enabled', 'send_days', 'send_times', 'recipient', 'location_label', 'location_lat', 'location_lng']);

export async function updateForecastSettings(patch = {}) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!FORECAST_COLS.has(k)) continue;
    // send_times is JSONB — store as JSON text.
    sets.push(`${k} = $${i++}${k === 'send_times' ? '::jsonb' : ''}`);
    vals.push(k === 'send_times' ? JSON.stringify(v) : v);
  }
  if (!sets.length) return getForecastSettings();
  sets.push(`updated_at = NOW()`);
  await query(`UPDATE forecast_settings SET ${sets.join(', ')} WHERE id = 1`, vals);
  return getForecastSettings();
}

// Current Europe/London wall-clock, used to match configured send slots.
function londonNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit',
      hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    hhmm: `${hour}:${parts.minute}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayIdx: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  };
}

// Send today's forecast as a scroll from the admin (David). `recipient` controls
// who receives it: 'partner' (Katie), 'me' (David only, for testing — never
// notifies the partner), or 'both'.
async function sendForecastScroll(cfg) {
  const adminRes = await query(`SELECT id FROM accounts WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  const adminId = adminRes.rows[0]?.id;
  if (!adminId) return false;
  const other = await findOtherUser(adminId);

  const body = await fetchForecastBody(cfg.location_lat, cfg.location_lng);
  if (!body) return false; // weather lookup failed — skip this slot, try next time

  // Resolve the recipient list. 'me' loops back to the admin's own account, so a
  // test can never land on the partner.
  const mode = cfg.recipient || 'partner';
  const recipients = [];
  if (mode === 'me') recipients.push(adminId);
  else if (mode === 'both') { recipients.push(adminId); if (other) recipients.push(other.id); }
  else if (other) recipients.push(other.id); // 'partner'
  if (recipients.length === 0) return false;

  for (const recipientId of recipients) {
    /* eslint-disable no-await-in-loop */
    await createScroll({
      senderId: adminId,
      recipientId,
      body,
      origin: { label: FORECAST_ORIGIN_LABEL, lat: FORECAST_ORIGIN.lat, lng: FORECAST_ORIGIN.lng },
      dest: { label: cfg.location_label, lat: cfg.location_lat, lng: cfg.location_lng },
      fromLabel: FORECAST_FROM_LABEL,
      skipMaxChars: true,
      // Loop-to-self test scrolls are flagged simulated for consistency with the
      // /new-chat harness (keeps them out of any partner-facing aggregates).
      simulated: recipientId === adminId,
    });
    /* eslint-enable no-await-in-loop */
  }
  return true;
}

// Resolver tick: if we're inside a configured send slot and haven't already
// fired it, send the forecast. Idempotent via last_sent_slot.
export async function runForecastScheduler() {
  const cfg = await getForecastSettings();
  if (!cfg || !cfg.enabled) return;
  const { hhmm, dateKey, dayIdx } = londonNow();
  const days = Array.isArray(cfg.send_days) ? cfg.send_days : [];
  const times = Array.isArray(cfg.send_times) ? cfg.send_times : [];
  if (!days.includes(dayIdx) || !times.includes(hhmm)) return;

  const slot = `${dateKey}T${hhmm}`;
  if (cfg.last_sent_slot === slot) return;
  // Claim the slot first (atomic-ish) so a second tick can't double-send.
  const claim = await query(
    `UPDATE forecast_settings SET last_sent_slot = $1
      WHERE id = 1 AND (last_sent_slot IS DISTINCT FROM $1)
      RETURNING id`,
    [slot],
  );
  if (claim.rowCount === 0) return;
  try {
    const ok = await sendForecastScroll(cfg);
    // If the weather lookup failed, release the slot so the next tick retries.
    if (!ok) await query(`UPDATE forecast_settings SET last_sent_slot = NULL WHERE id = 1 AND last_sent_slot = $1`, [slot]);
  } catch {
    await query(`UPDATE forecast_settings SET last_sent_slot = NULL WHERE id = 1 AND last_sent_slot = $1`, [slot]).catch(() => {});
  }
}

// Admin "send a test forecast now" — bypasses the schedule.
export async function sendForecastNow() {
  const cfg = await getForecastSettings();
  if (!cfg) return false;
  return sendForecastScroll(cfg);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function getSettings() {
  const { rows } = await query(`SELECT * FROM scrolls_settings WHERE id = TRUE`);
  return rows[0] ?? null;
}

export async function getFrames(layer = null) {
  if (layer) {
    const { rows } = await query(
      `SELECT * FROM scrolls_frames WHERE layer = $1 ORDER BY frame_order`, [layer],
    );
    return rows;
  }
  const { rows } = await query(`SELECT * FROM scrolls_frames ORDER BY layer, frame_order`);
  return rows;
}

// Admin: patch the single settings row. Only whitelisted columns.
const SETTINGS_COLS = new Set([
  'enabled',
  'frame_rate_fps', 'crow_speed_kmh', 'speed_multiplier', 'min_flight_seconds',
  'max_flight_seconds', 'max_chars', 'scroll_font', 'scroll_bg_file',
  'seal_open_file', 'seal_stamped_file', 'send_branch_file', 'land_branch_file',
  'send_branch_x', 'send_branch_y', 'send_branch_scale', 'send_branch_rotation', 'send_branch_opacity',
  'land_branch_x', 'land_branch_y', 'land_branch_scale', 'land_branch_rotation', 'land_branch_opacity',
]);

export async function updateSettings(patch = {}) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!SETTINGS_COLS.has(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (!sets.length) return getSettings();
  sets.push(`updated_at = NOW()`);
  await query(`UPDATE scrolls_settings SET ${sets.join(', ')} WHERE id = TRUE`, vals);
  return getSettings();
}

// Admin: replace all frames for a layer in one transaction (the editor sends the
// full ordered list). Keeps frame_order contiguous and avoids stale rows.
export async function replaceFrames(layer, frames = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM scrolls_frames WHERE layer = $1`, [layer]);
    let order = 0;
    for (const f of frames) {
      await client.query(
        `INSERT INTO scrolls_frames
           (layer, frame_order, sprite_file, x, y, scale, rotation, opacity, duration_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          layer, order++, f.sprite_file ?? `crow_${layer}_${String(order).padStart(2, '0')}.png`,
          f.x ?? 50, f.y ?? 50, f.scale ?? 1, f.rotation ?? 0, f.opacity ?? 1,
          f.duration_ms ?? 80,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getFrames(layer);
}

// ---------------------------------------------------------------------------
// Flight-time simulation
// ---------------------------------------------------------------------------

// Great-circle distance in km. Returns 0 if either point is missing.
export function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((n) => n == null || Number.isNaN(Number(n)))) return 0;
  const R = 6371;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Convert a distance into the real-world delay (seconds) the recipient waits,
// applying the admin speed multiplier and clamps.
export function flightSeconds(distanceKm, settings) {
  const speedKmh = Number(settings?.crow_speed_kmh) || 45;
  const multiplier = Number(settings?.speed_multiplier) || 1;
  const min = Number(settings?.min_flight_seconds) || 0;
  const max = Number(settings?.max_flight_seconds) || 86400;
  const inWorldSeconds = (distanceKm / speedKmh) * 3600;
  const realSeconds = inWorldSeconds / multiplier;
  return Math.round(Math.min(max, Math.max(min, realSeconds)));
}

// ---------------------------------------------------------------------------
// Scrolls
// ---------------------------------------------------------------------------

export async function createScroll({
  senderId, recipientId, body,
  origin = {}, dest = {}, simulated = false,
  fromLabel = null, skipMaxChars = false,
}) {
  const text = (body ?? '').trim();
  if (!text) { const e = new Error('Scroll body required'); e.statusCode = 400; throw e; }

  const settings = await getSettings();
  if (!skipMaxChars && settings?.max_chars && text.length > settings.max_chars) {
    const e = new Error(`Scroll exceeds ${settings.max_chars} characters`);
    e.statusCode = 400; throw e;
  }

  const distanceKm = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const secs = flightSeconds(distanceKm, settings);

  const { rows } = await query(
    `INSERT INTO scrolls
       (sender_id, recipient_id, body,
        origin_label, origin_lat, origin_lng,
        dest_label, dest_lat, dest_lng,
        distance_km, flight_seconds, simulated, from_label, deliver_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW() + ($11::int * interval '1 second'))
     RETURNING *`,
    [
      senderId, recipientId, text,
      origin.label ?? null, origin.lat ?? null, origin.lng ?? null,
      dest.label ?? null, dest.lat ?? null, dest.lng ?? null,
      distanceKm, secs, !!simulated, fromLabel,
    ],
  );
  const scroll = rows[0];
  // Reverse-geocode the streets the crow will pass over (best-effort, async).
  computeRouteStreets(scroll).catch(() => {});
  // Fire the crow Live Activity on the recipient's device (push-to-start).
  startLiveActivityFor(scroll).catch(() => {});
  return scroll;
}

// Recipient's received scrolls (only those whose crow has actually arrived).
// Forecast scrolls (from_label set — "the Three-Eyed Crow") are intentionally
// excluded: they live only as a Live Activity notification and must never show
// up as an unread scroll in /messages. Standard scrolls (from_label NULL) list
// as normal.
export async function listReceived(recipientId) {
  const { rows } = await query(
    `SELECT s.*, a.name AS sender_name, a.username AS sender_username, a.photo_url AS sender_photo
       FROM scrolls s
       JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1
        AND s.deliver_at <= NOW()
        AND s.from_label IS NULL
      ORDER BY s.deliver_at DESC`,
    [recipientId],
  );
  return rows;
}

// Recipient's IN-FLIGHT scrolls (crow still on its way). Drives the "crow
// incoming" countdown toast — earliest arrival first.
export async function listIncoming(recipientId) {
  const { rows } = await query(
    `SELECT s.id, s.origin_label, s.dest_label, s.deliver_at, s.flight_seconds,
            a.name AS sender_name
       FROM scrolls s
       JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1
        AND s.deliver_at > NOW()
      ORDER BY s.deliver_at ASC`,
    [recipientId],
  );
  return rows;
}

// Count of arrived-but-unread scrolls (drives the "crow has arrived" badge).
// Forecast scrolls (from_label set) are excluded so the daily weather crow never
// raises an unread badge — it lives only as a Live Activity notification.
export async function unreadCount(recipientId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM scrolls
      WHERE recipient_id = $1 AND deliver_at <= NOW() AND read_at IS NULL
        AND from_label IS NULL`,
    [recipientId],
  );
  return rows[0]?.n ?? 0;
}

// Reading a scroll removes it (ephemeral — gone once read). End any Live
// Activity for it first so the crow banner dismisses when you open the scroll.
export async function markRead(scrollId, accountId) {
  try {
    const state = crowContentState({ startedAtMs: Date.now() - 1000, arrivesAtMs: Date.now(), landed: true });
    const { rows } = await query(`SELECT la_channel_id FROM scrolls WHERE id = $1`, [scrollId]);
    const channelId = rows[0]?.la_channel_id;
    if (channelId) {
      // End + tear down the broadcast channel.
      sendBroadcast(channelId, { event: 'end', contentState: state, dismissalMs: Date.now() })
        .then(() => deleteBroadcastChannel(channelId))
        .catch(() => {});
    } else {
      const tokens = await updateTokensFor(scrollId);
      for (const token of tokens) {
        sendLiveActivityPush(token, { event: 'end', contentState: state, dismissalMs: Date.now() }).catch(() => {});
      }
    }
  } catch { /* best effort */ }
  await query(
    `DELETE FROM scrolls WHERE id = $1 AND recipient_id = $2`,
    [scrollId, accountId],
  );
  return { ok: true };
}

// Delivery resolver: atomically claim scrolls whose crow has just arrived, flip
// them to delivered, and announce the arrival. The Live Activity (push-update)
// is the primary arrival signal now; the classic alert push is only a fallback
// for recipients with no running activity (e.g. app never registered a token).
export async function resolveDueScrolls() {
  const { rows } = await query(
    `UPDATE scrolls
        SET delivered = TRUE, delivered_at = NOW(), status = 'delivered'
      WHERE delivered = FALSE AND deliver_at <= NOW()
      RETURNING id, recipient_id, origin_label, from_label, flight_seconds, body, la_channel_id`,
  );
  for (const s of rows) {
    try {
      const origin = s.from_label || s.origin_label || 'afar';
      // Forecast scrolls (from the Three-Eyed Crow) get their own arrival title.
      const arrivedTitle = s.from_label ? 'A Three-Eyed Crow has arrived' : `News from ${origin}.`;
      // The scroll's own text becomes the landed subtitle (widget truncates).
      const preview = (s.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      // While muted, finalise silently (no alert) and never raise a banner.
      const muted = await isMuted(s.recipient_id);
      const arrivesAtMs = Date.now();
      const startedAtMs = arrivesAtMs - (Number(s.flight_seconds) || 0) * 1000;
      const state = crowContentState({ startedAtMs, arrivesAtMs, landed: true, message: preview, phase: 4 });
      const alert = muted ? undefined : { title: arrivedTitle, body: preview || 'A crow has arrived' };

      if (s.la_channel_id) {
        // Broadcast the landing to the channel — reaches a closed app, in-scroll.
        await sendBroadcast(s.la_channel_id, { event: 'update', contentState: state, alert });
      } else {
        const tokens = await updateTokensFor(s.id);
        if (tokens.length) {
          for (const token of tokens) {
            await sendLiveActivityPush(token, { event: 'update', contentState: state, alert });
          }
        } else {
          // No Live Activity reachable — fall back to the classic alert push.
          await sendPush(s.recipient_id, {
            title: arrivedTitle,
            body: preview || 'A crow has arrived',
            url: '/messages?scrolls=1',
            tag: 'scroll-arrival',
          });
        }
      }
    } catch { /* push is best-effort */ }
  }
  return rows.length;
}
