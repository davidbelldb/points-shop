import { query, pool } from '../../db.js';
import { config } from '../../config.js';
import { sendPush, isMuted } from '../notifications/push.js';
import {
  sendLiveActivityPush, crowContentState, sendSilentWake,
  createBroadcastChannel, deleteBroadcastChannel, sendBroadcast,
} from '../notifications/apns.js';
import { findOtherUsers } from '../chat/chat.repo.js';
import { fetchForecastBody } from './forecast.js';

// ---------------------------------------------------------------------------
// Live Activity (crow) push helpers
// ---------------------------------------------------------------------------

/** Upsert a Live Activity token (push-to-start, or per-scroll update). */
export async function saveLiveActivityToken({ accountId, kind, scrollId = null, token, app = 'capacitor', environment = 'production' }) {
  if (!token) return;
  // `app` decides which APNs topic this token is later addressed at. It
  // defaults to 'capacitor', so a client that doesn't send one behaves exactly
  // as it always has.
  const which = app === 'native' ? 'native' : 'capacitor';
  const env = environment === 'development' ? 'development' : 'production';
  await query(
    `INSERT INTO live_activity_tokens (account_id, kind, scroll_id, token, app, environment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (token) DO UPDATE
       SET account_id = EXCLUDED.account_id, kind = EXCLUDED.kind,
           scroll_id = EXCLUDED.scroll_id, app = EXCLUDED.app,
           environment = EXCLUDED.environment, updated_at = NOW()`,
    [accountId, kind, scrollId, token, which, env],
  );
}

async function ptsTokenFor(accountId) {
  const { rows } = await query(
    `SELECT token FROM live_activity_tokens
      WHERE account_id = $1 AND kind = 'pts' AND app = 'capacitor'
      ORDER BY updated_at DESC LIMIT 1`,
    [accountId],
  );
  return rows[0]?.token || null;
}

/**
 * The newest push-to-start token per app — one Live Activity each.
 *
 * The Capacitor app's row is untouched by this: it still resolves the same
 * token it always did, and is pushed to the same topic. The native app is an
 * additional recipient, addressed at its own bundle id.
 */
async function ptsTokensByApp(accountId) {
  const { rows } = await query(
    `SELECT DISTINCT ON (app) app, token, environment
       FROM live_activity_tokens
      WHERE account_id = $1 AND kind = 'pts'
      ORDER BY app, updated_at DESC`,
    [accountId],
  );
  return rows.map((r) => ({
    token: r.token,
    bundleId: r.app === 'native' ? config.apns.bundleIdNative : config.apns.bundleId,
    // A development build's token only answers on the sandbox gateway.
    sandbox: r.environment === 'development',
  }));
}

// Push-to-start tokens for BOTH the recipient and the sender, so the sender can
// follow the same Live Activity on their own lock screen. Recipient first (its
// env keys the broadcast channel); deduped by token. Both devices bind to the one
// channel, so every broadcast update reaches both at once.
async function bothPartyPtsTokens(recipientId, senderId) {
  const recip = await ptsTokensByApp(recipientId);
  if (!senderId || senderId === recipientId) return recip;
  const seen = new Set(recip.map((t) => t.token));
  const sender = (await ptsTokensByApp(senderId)).filter((t) => !seen.has(t.token));
  return [...recip, ...sender];
}

async function updateTokensFor(scrollId) {
  const { rows } = await query(
    `SELECT token FROM live_activity_tokens WHERE scroll_id = $1 AND kind = 'update'`,
    [scrollId],
  );
  return rows.map((r) => r.token);
}

/**
 * Push-to-start a crow activity on someone's device, for anything that flies.
 *
 * Extracted so a chat message can raise the same banner a scroll does — the
 * activity doesn't care which table the journey came from, only when the crow
 * left, when it lands, and what the two ends are called.
 *
 * Returns the broadcast channel id, so the caller can store it and drive the
 * updates and the landing through it.
 */
export async function startCrowActivity({
  recipientId, id, startedAtMs, arrivesAtMs,
  originLabel = 'afar', destLabel = '', kind = 'scroll',
  message = '', alert,
}) {
  // Respect the recipient's mute window — no new Live Activity while muted.
  if (await isMuted(recipientId)) return null;
  const targets = await ptsTokensByApp(recipientId);
  if (!targets.length) return null;

  // A broadcast channel means updates and the landing reach the device even
  // with the app fully closed; the device-token path is the fallback.
  let channelId = null;
  try { channelId = await createBroadcastChannel(); } catch { /* fall back */ }

  for (const target of targets) {
    await sendLiveActivityPush(target.token, {
      event: 'start',
      channelId,
      bundleId: target.bundleId,
      sandbox: target.sandbox,
      contentState: crowContentState({ startedAtMs, arrivesAtMs, landed: false, message }),
      attributes: { kind, originLabel, destLabel, scrollId: id },
      alert,
    });
  }
  if (!channelId) setTimeout(() => { sendSilentWake(recipientId).catch(() => {}); }, 3000);
  return channelId;
}

// Push-to-start the crow activity on the recipient's device (works app-closed).
async function startLiveActivityFor(scroll) {
  try {
    // Respect the recipient's mute window — no new Live Activity while muted.
    if (await isMuted(scroll.recipient_id)) { console.warn(`[crow-la] ${scroll.id} muted — skipped`); return; }
    const targets = await bothPartyPtsTokens(scroll.recipient_id, scroll.sender_id);
    if (!targets.length) { console.warn(`[crow-la] ${scroll.id} no pts token for ${scroll.recipient_id}`); return; }
    console.log(`[crow-la] ${scroll.id} start: ${targets.length} target(s) [${targets.map((t) => (t.sandbox ? 'sandbox' : 'prod')).join(', ')}] bundle=${targets.map((t) => t.bundleId).join(',')}`);
    const arrivesAtMs = new Date(scroll.deliver_at).getTime();
    const startedAtMs = arrivesAtMs - (Number(scroll.flight_seconds) || 0) * 1000;
    // Create a broadcast channel so live updates + the landing reach the recipient
    // even with their app fully closed (no device-captured token needed). Falls
    // back to the device-token path if channel creation fails. The channel MUST be
    // on the same APNs environment as the device (sandbox for a Debug build) or the
    // start can't bind it.
    const sandbox = !!targets[0]?.sandbox;
    let channelId = null;
    try { channelId = await createBroadcastChannel(sandbox); } catch { /* fall back */ }
    if (channelId) {
      // Stamp the re-issue cycle clock so reissueStaleCrowActivities() knows when
      // this card was last (re)started and can replace it before the ~8h iOS cap.
      await query(
        `UPDATE scrolls SET la_channel_id = $1, la_cycle_started_at = NOW(), la_sandbox = $3 WHERE id = $2`,
        [channelId, scroll.id, sandbox],
      ).catch(() => {});
    }
    // One start per app the recipient has installed. A channel is shared, so
    // the same broadcast updates reach both.
    for (const target of targets) {
    await sendLiveActivityPush(target.token, {
      event: 'start',
      channelId,
      bundleId: target.bundleId,
      sandbox: target.sandbox,
      contentState: crowContentState({
        startedAtMs, arrivesAtMs, landed: false,
        // Forecast scrolls open with their own line before street narration.
        message: scroll.from_label ? 'A prophetic bird travels east with news' : '',
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
          ? 'A prophetic bird travels east with news'
          : `A bird has been dispatched from ${scroll.origin_label || 'afar'}`,
      },
    });
    }
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
export async function reverseStreet(lat, lng) {
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

// Reverse-geocode a single point to its COUNTRY (Nominatim, low zoom so it
// resolves the nation rather than a street). Returns null over open water or on
// any failure — the narrator renders that as "out over the open sea".
export async function reverseCountry(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=3&addressdetails=1`
      + `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SneakyStuff/1.0 (crow flight narration)', 'Accept-Language': 'en-GB' },
    });
    if (!res.ok) return null;
    const a = (await res.json())?.address ?? {};
    return a.country || null;
  } catch { return null; }
}

// Single source of truth: the three waypoint nodes sit at these fractions of the
// journey. The widget draws nodes here, the geocoder samples streets here, and
// the scheduler fires each node's update as the progress bar reaches it.
export const WAYPOINT_FRACS = [0.25, 0.50, 0.75];
// A final "coming into land" beat just before arrival (no node, text only).
export const LANDING_FRAC = 0.92;
// Fire each update this far ahead of the bar reaching the mark, to absorb poll +
// push-delivery latency so the node pops exactly as the fill arrives (capped at
// 10% of the flight so short hops don't fire too early).
const LEAD_MS = 1800;

// Sample each waypoint along the origin→dest line and reverse-geocode it, so the
// narrated streets genuinely lie between the two addresses. Stored once on the
// scroll row; the scheduler reads them. Best-effort — never throws.
/**
 * The streets a straight origin→destination flight passes over, sampled at the
 * three waypoint fractions.
 *
 * Nominatim asks for one request a second and means it, so this paces itself —
 * three waypoints take a little over two seconds. Pulled out of
 * computeRouteStreets so the test rig and chat messages can use it without
 * going through the scrolls table.
 */
export async function streetsAlong({ originLat, originLng, destLat, destLng }) {
  const a = [Number(originLat), Number(originLng)];
  const b = [Number(destLat), Number(destLng)];
  if (![...a, ...b].every(Number.isFinite)) return [];

  const out = [];
  for (const t of WAYPOINT_FRACS) {
    const lat = a[0] + (b[0] - a[0]) * t;
    const lng = a[1] + (b[1] - a[1]) * t;
    /* eslint-disable no-await-in-loop */
    const name = await reverseStreet(lat, lng);
    // Avoid repeating the previous street back-to-back.
    out.push(name && name !== out[out.length - 1] ? name : null);
    await new Promise((r) => setTimeout(r, 1100));
    /* eslint-enable no-await-in-loop */
  }
  return out;
}

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

// Evenly-spaced sample points along the flight (kept off the very start/end so
// the first/last beats aren't the origin/destination country). On a long-haul
// flight the narrator reads these out one by one as the crow passes them. 13
// points (an N=14 division) gives rich, roughly-twice-daily country beats on a
// week-long flight — e.g. France → Germany → Croatia → Serbia → Bulgaria →
// Türkiye → Syria → Iraq → Kuwait → the Gulf → UAE → Arabian Sea → India.
export const COUNTRY_FRACS = Array.from({ length: 13 }, (_, i) => Number(((i + 1) / 14).toFixed(3)));

// Reverse-geocode each of the six country-sample points along the origin→dest
// line and store them on the scroll. Best-effort + async, like computeRouteStreets.
// Entries are null over open water (narrated as "the open sea").
async function computeRouteCountries(scroll) {
  const aLat = Number(scroll.origin_lat); const aLng = Number(scroll.origin_lng);
  const bLat = Number(scroll.dest_lat); const bLng = Number(scroll.dest_lng);
  if (![aLat, aLng, bLat, bLng].every(Number.isFinite)) return;
  const out = [];
  for (const t of COUNTRY_FRACS) {
    const lat = aLat + (bLat - aLat) * t;
    const lng = aLng + (bLng - aLng) * t;
    /* eslint-disable no-await-in-loop */
    const name = await reverseCountry(lat, lng);
    // Keep every sample's own country (null = over open water → "the open sea").
    // With dense sampling a big country legitimately spans several beats, and the
    // narrator varies its verb each time, so repeats read fine ("Crossing Türkiye"
    // → "Soaring over Türkiye") rather than being collapsed to a false sea gap.
    out.push(name || null);
    await new Promise((r) => setTimeout(r, 1100)); // honour Nominatim's 1 req/s
    /* eslint-enable no-await-in-loop */
  }
  if (out.some(Boolean)) {
    await query(`UPDATE scrolls SET route_countries = $1 WHERE id = $2`,
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

// A local (Cambridge-area) hop, ≤40 km end-to-end. Beyond that the crow has left the
// curated-street area, so the Cambridge fallbacks must NOT be used.
function isLocalJourney(scroll) {
  const km = haversineKm(Number(scroll.origin_lat), Number(scroll.origin_lng), Number(scroll.dest_lat), Number(scroll.dest_lng));
  return Number.isFinite(km) && km <= 40;
}

export function streetMessage(phase, scroll) {
  if (phase === 4) return `Coming in to land at ${scroll.dest_label || 'its destination'}`;
  // 1) real reverse-geocoded street on the path, 2) nearest curated street. The
  // curated Cambridge fallbacks (routeStreet / pickStreets) only apply to a LOCAL hop —
  // on a long-distance flight we narrate generically rather than name a random
  // Cambridge street the crow is nowhere near.
  const routed = Array.isArray(scroll.route_streets) ? scroll.route_streets[phase - 1] : null;
  const local = isLocalJourney(scroll);
  let street = routed || (local ? routeStreet(scroll, PHASE_FRAC[phase]) : null);
  if (!street && local) street = pickStreets(scroll.id)[phase - 1];
  if (!street) {
    switch (phase) {
      case 1: return 'Probably somewhere over open country';
      case 2: return 'Likely soaring high over the fields';
      case 3: return 'Last spotted crossing open country';
      default: return '';
    }
  }
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

// How many country-sample points the crow has passed right now (0–`count`),
// fired the same LEAD_MS early as the node phase. Independent of the 3 visual
// waypoint nodes — it only drives the subtitle country narration. `count` is the
// stored route_countries length. If `fracs` (route_country_fracs) is given it is
// the fraction-of-journey at which each country is actually crossed, so the beats
// track the real path; otherwise the points are spaced evenly at (i+1)/(count+1),
// which also keeps older/auto scrolls narrating correctly (no recompute needed).
function reachedCountryStep(startedAtMs, arrivesAtMs, count, fracs) {
  if (!count) return 0;
  const total = Math.max(1, arrivesAtMs - startedAtMs);
  const lead = Math.min(LEAD_MS, total * 0.1);
  const at = Date.now() + lead;
  const useCustom = Array.isArray(fracs) && fracs.length === count;
  let step = 0;
  for (let i = 0; i < count; i += 1) {
    const frac = useCustom ? Number(fracs[i]) : (i + 1) / (count + 1);
    if (at >= startedAtMs + frac * total) step = i + 1;
  }
  return step;
}

// Country narration for a long-haul flight. Phase 4 is always the landing beat.
// A null country-sample means open water. Verb varies gently across the journey.
// Bespoke, hand-written lines for specific countries (keyed by the exact name in
// route_countries). When present, the custom line wins over the generic verb —
// a little love note in the local tongue as the roller passes over. Add more here.
const COUNTRY_PHRASES = {
  France: 'Eiffel for these views (and your face, ofc)',
  Germany: 'Hoch hinaus, meine Liebe!',
  Austria: 'Servus, mein Überflieger!',
  Croatia: "As nice as this is, it's time to… Split.",
  'Bosnia and Herzegovina': "Less Balkan, more squarkin'!",
  Greece: 'Herculean task, this!',
  Turkey: 'An-kara be honest—this is some view',
  Syria: "It's as cold as isis up here...",
  Iraq: "Iraq and roller, me. 'Cos I'm a roller, get it?",
  Kuwait: 'Just Ku-wait and see… my face next week.',
  'United Arab Emirates': 'Emirate-ing south for Katie James',
  'Arabian Sea': 'Araaabian flights amiright?!',
  India: 'Head India clouds, thinking about that butt hole',
};
// Rotating verbs for countries without a bespoke line, so a many-beat flight
// doesn't repeat the same phrasing; the very first beat gets a "Setting out" opener.
const COUNTRY_LEADS = ['Now over', 'Crossing', 'Passing over', 'Soaring over', 'Gliding across', 'Sailing over'];
function countryNarration(scroll, nodePhase, countryStep) {
  const list = Array.isArray(scroll.route_countries) ? scroll.route_countries : null;
  if (nodePhase >= 4) {
    // Landing beat: use the destination country's bespoke line if there is one
    // (the last named country in the route), so it's the final thing shown — else
    // the default "coming in to land".
    const destCountry = list ? [...list].reverse().find(Boolean) : null;
    if (destCountry && COUNTRY_PHRASES[destCountry]) return COUNTRY_PHRASES[destCountry];
    return `Coming in to land at ${scroll.dest_label || 'its destination'}`;
  }
  const country = list && countryStep > 0 ? list[countryStep - 1] : null;
  if (!country) return countryStep > 0 ? 'Out over the open sea' : '';
  if (COUNTRY_PHRASES[country]) return COUNTRY_PHRASES[country];
  if (countryStep === 1) return `Setting out over ${country}`;
  return `${COUNTRY_LEADS[(countryStep - 2) % COUNTRY_LEADS.length]} ${country}`;
}

// The right subtitle for this moment: country narration on a long-haul flight
// (once route_countries is computed), else the Cambridge street narration.
function narrationFor(scroll, nodePhase, countryStep) {
  const hasCountries = Array.isArray(scroll.route_countries) && scroll.route_countries.some(Boolean);
  if (!isLocalJourney(scroll) && hasCountries) return countryNarration(scroll, nodePhase, countryStep);
  return streetMessage(nodePhase, scroll);
}

// Called on the resolver tick: nudge each in-flight crow's subtitle forward when
// it crosses into a new phase. Only touches scrolls with a live update token.
export async function pushStreetSubtitleUpdates() {
  const { rows } = await query(
    `SELECT s.id, s.recipient_id, s.deliver_at, s.flight_seconds, s.dest_label, s.la_phase,
            s.la_country_step, s.route_countries, s.route_country_fracs,
            s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.route_streets, s.la_channel_id, s.la_sandbox, s.from_label
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
      const nodePhase = reachedPhase(startedAtMs, arrivesAtMs);
      const countryStep = reachedCountryStep(startedAtMs, arrivesAtMs, Array.isArray(s.route_countries) ? s.route_countries.length : 0, s.route_country_fracs);
      const nodeAdvanced = nodePhase > (Number(s.la_phase) || 0);
      const countryAdvanced = countryStep > (Number(s.la_country_step) || 0);
      // The crow has moved on if it crossed a visual node OR a country-sample point.
      if (!nodeAdvanced && !countryAdvanced) continue;

      const msg = narrationFor(s, nodePhase, countryStep);
      const state = crowContentState({
        startedAtMs, arrivesAtMs, landed: false, message: msg, phase: nodePhase,
      });
      // A ping/vibration only when a visual waypoint node pops — country-only
      // beats update the text silently so a long-haul flight doesn't buzz ~9 times.
      const alert = nodeAdvanced
        ? { title: s.from_label ? 'The Indian Roller' : 'A bird en route', body: msg }
        : undefined;
      if (s.la_channel_id) {
        await sendBroadcast(s.la_channel_id, { event: 'update', contentState: state, alert, sandbox: s.la_sandbox });
      } else {
        const tokens = await updateTokensFor(s.id);
        for (const token of tokens) {
          await sendLiveActivityPush(token, { event: 'update', contentState: state, alert });
        }
      }
      await query(`UPDATE scrolls SET la_phase = $1, la_country_step = $2 WHERE id = $3`,
        [nodePhase, countryStep, s.id]);
    } catch { /* best effort per scroll */ }
  }
  return rows.length;
}

// iOS ends a Live Activity after ~8 hours. We re-issue a fresh one at 4h (margin)
// so a multi-day crow keeps a live lock-screen / Dynamic Island card the whole way.
// Override with env LA_CYCLE_MINUTES (e.g. 4) to watch the swap happen in minutes
// during a loop-to-self test; leave unset for the 4h (240-minute) production value.
const LA_CYCLE_MINUTES = Number(process.env.LA_CYCLE_MINUTES) || 240;
const LA_CYCLE_MS = LA_CYCLE_MINUTES * 60 * 1000;

// Replace the crow Live Activity for any in-flight scroll whose current card is
// older than LA_CYCLE_MS. A fresh activity is push-to-started on a NEW broadcast
// channel carrying the exact live flight state (same start/arrival, current phase
// + narration), then the OLD channel is ended so its card is dismissed — leaving
// exactly one card, no stack, no gap. Absolute start/arrival timestamps mean the
// new card's native countdown + trail resume seamlessly even with no further
// update pushes. Runs on the resolver tick; best-effort per scroll.
export async function reissueStaleCrowActivities() {
  const { rows } = await query(
    `SELECT s.id, s.recipient_id, s.sender_id, s.deliver_at, s.flight_seconds, s.dest_label,
            s.origin_label, s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng,
            s.route_streets, s.route_countries, s.route_country_fracs, s.la_channel_id, s.la_phase, s.from_label
       FROM scrolls s
      WHERE s.delivered = FALSE
        AND s.deliver_at > NOW()
        AND s.la_channel_id IS NOT NULL
        AND s.la_cycle_started_at IS NOT NULL
        AND s.la_cycle_started_at < NOW() - make_interval(secs => $1)`,
    [Math.round(LA_CYCLE_MS / 1000)],
  );
  for (const s of rows) {
    try {
      // Muted → let the card lapse rather than re-raising it.
      if (await isMuted(s.recipient_id)) continue;
      const targets = await bothPartyPtsTokens(s.recipient_id, s.sender_id);
      if (!targets.length) continue;

      // The broadcast channel + its manage/send hosts must match the device's
      // APNs environment (Debug build → sandbox, Release/TestFlight → production).
      // Mirror startLiveActivityFor: key off the first target's env.
      const sandbox = !!targets[0]?.sandbox;

      const arrivesAtMs = new Date(s.deliver_at).getTime();
      const startedAtMs = arrivesAtMs - (Number(s.flight_seconds) || 0) * 1000;
      const phase = reachedPhase(startedAtMs, arrivesAtMs);
      const countryStep = reachedCountryStep(startedAtMs, arrivesAtMs, Array.isArray(s.route_countries) ? s.route_countries.length : 0, s.route_country_fracs);
      const message = (phase > 0 || countryStep > 0) ? narrationFor(s, phase, countryStep) : '';
      const oldChannel = s.la_channel_id;

      // Fresh channel + fresh activity carrying the current flight state.
      let newChannel = null;
      try { newChannel = await createBroadcastChannel(sandbox); } catch { /* skip this cycle */ }
      if (!newChannel) continue;

      const state = crowContentState({ startedAtMs, arrivesAtMs, landed: false, message, phase });
      for (const target of targets) {
        await sendLiveActivityPush(target.token, {
          event: 'start',
          channelId: newChannel,
          bundleId: target.bundleId,
          sandbox: target.sandbox,
          contentState: state,
          attributes: {
            kind: s.from_label ? 'forecast' : 'scroll',
            originLabel: s.from_label || s.origin_label || 'afar',
            destLabel: s.dest_label || '',
            scrollId: s.id,
          },
        });
      }

      // Point the scroll at the new channel BEFORE ending the old one, so a
      // landing or street update that races in never targets a dead channel.
      await query(
        `UPDATE scrolls SET la_channel_id = $1, la_cycle_started_at = NOW(), la_sandbox = $3 WHERE id = $2`,
        [newChannel, s.id, sandbox],
      );

      // Dismiss the previous card and tear down its channel — only the new remains.
      sendBroadcast(oldChannel, { event: 'end', contentState: state, dismissalMs: Date.now(), sandbox })
        .then(() => deleteBroadcastChannel(oldChannel))
        .catch(() => {});
    } catch { /* best effort per scroll */ }
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Daily weather forecast scroll
// ---------------------------------------------------------------------------

// The flight always lands at the centre of the configured forecast location and
// sets off to the WEST (with a touch of north) of it, so the Indian Roller
// makes a short, real local journey in over the land (streets reverse-geocoded
// along the way) wherever the forecast is for. Offsets are converted from km to
// degrees — latitude is ~constant; longitude shrinks by cos(latitude).
const FORECAST_ORIGIN_NORTH_KM = 2;   // a touch north…
const FORECAST_ORIGIN_WEST_KM = 6;    // …and to the west of the centre (~6 km out)
const KM_PER_DEG_LAT = 110.574;
const FORECAST_FROM_LABEL = 'the Indian Roller';

// Origin point + label for a forecast whose destination is the given location.
function forecastOrigin(cfg) {
  const lat = Number(cfg.location_lat);
  const lng = Number(cfg.location_lng);
  const kmPerDegLng = KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return {
    lat: lat + FORECAST_ORIGIN_NORTH_KM / KM_PER_DEG_LAT,
    lng: lng - FORECAST_ORIGIN_WEST_KM / kmPerDegLng,
    label: `the open country west of ${cfg.location_label || 'the forecast'}`,
  };
}

export async function getForecastSettings() {
  const { rows } = await query(`SELECT * FROM forecast_settings WHERE id = 1`);
  return rows[0] ?? null;
}

const FORECAST_COLS = new Set(['enabled', 'send_days', 'send_times', 'recipient', 'location_label', 'location_lat', 'location_lng', 'timezone']);

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

// Current wall-clock in the given IANA timezone, used to match configured send
// slots. The forecast's send_times are interpreted in the FORECAST LOCATION's own
// local time (forecast_settings.timezone) — so "08:00" fires at 08:00 Pondicherry
// when the forecast is for Pondicherry, the same clock reading as 08:00 UK local.
function zoneNow(timeZone = 'Europe/London') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit',
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
// who receives it: 'partner' (everyone else in the house), 'me' (David only,
// for testing — never notifies anyone else), or 'both'.
async function sendForecastScroll(cfg) {
  const adminRes = await query(`SELECT id FROM accounts WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  const adminId = adminRes.rows[0]?.id;
  if (!adminId) return false;
  const others = await findOtherUsers(adminId);

  const body = await fetchForecastBody(cfg.location_lat, cfg.location_lng);
  if (!body) return false; // weather lookup failed — skip this slot, try next time

  // Resolve the recipient list. 'me' loops back to the admin's own account, so a
  // test can never land on the partner.
  const mode = cfg.recipient || 'partner';
  const otherIds = others.map((o) => o.id);
  const recipients = [];
  if (mode === 'me') recipients.push(adminId);
  else if (mode === 'both') recipients.push(adminId, ...otherIds);
  else recipients.push(...otherIds); // 'partner' — everyone else
  if (recipients.length === 0) return false;

  const origin = forecastOrigin(cfg);
  for (const recipientId of recipients) {
    /* eslint-disable no-await-in-loop */
    await createScroll({
      senderId: adminId,
      recipientId,
      body,
      origin,
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
  const { hhmm, dateKey, dayIdx } = zoneNow(cfg.timezone || 'Europe/London');
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
  // Reverse-geocode the streets (local hop) and countries (long-haul) the crow
  // will pass over (best-effort, async).
  computeRouteStreets(scroll).catch(() => {});
  computeRouteCountries(scroll).catch(() => {});
  // Fire the crow Live Activity on the recipient's device (push-to-start).
  startLiveActivityFor(scroll).catch(() => {});
  return scroll;
}

// Recipient's received scrolls (only those whose crow has actually arrived).
// Forecast scrolls (from_label set — "the Indian Roller") are intentionally
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

// Scrolls that a perched crow on the CROW TRACKER holds at a location: the recipient's
// delivered-but-unread message scrolls PLUS the day's forecast scroll (the latest per
// destination). Full rows, so the tracker renders each in the real scroll reader and
// pools message + forecast crows together per location. Unlike /messages (listReceived),
// this DOES include forecasts — the tracker is where the weather scroll can be read.
export async function listPerchScrolls(recipientId) {
  const { rows: msgs } = await query(
    `SELECT s.*, a.name AS sender_name, a.username AS sender_username, a.photo_url AS sender_photo
       FROM scrolls s JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1 AND s.from_label IS NULL AND s.deliver_at <= NOW()
      ORDER BY s.deliver_at DESC`,
    [recipientId],
  );
  const { rows: forecasts } = await query(
    `SELECT DISTINCT ON (s.dest_lat, s.dest_lng)
            s.*, a.name AS sender_name, a.username AS sender_username, a.photo_url AS sender_photo
       FROM scrolls s JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1 AND s.from_label IS NOT NULL
        AND s.deliver_at <= NOW() AND s.deliver_at >= date_trunc('day', NOW())
      ORDER BY s.dest_lat, s.dest_lng, s.deliver_at DESC`,
    [recipientId],
  );
  return [...msgs, ...forecasts];
}

// Every scroll between two people, both directions, oldest first — the native
// Messages thread. Forecast scrolls (from_label set) stay out; they belong to
// the tracker. A scroll you've been sent keeps its body hidden until its crow
// lands, so an in-flight bubble can't be peeked at by reading the payload;
// your own scrolls are always legible to you.
export async function listThread(accountId, partnerId) {
  const { rows } = await query(
    `SELECT s.id, s.sender_id, s.recipient_id,
            CASE WHEN s.sender_id = $1 OR s.deliver_at <= NOW()
                 THEN s.body ELSE NULL END AS body,
            s.origin_label, s.dest_label,
            s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.route_streets,
            s.sent_at, s.deliver_at, s.flight_seconds,
            s.delivered, s.delivered_at, s.read_at,
            a.name AS sender_name, a.username AS sender_username, a.photo_url AS sender_photo
       FROM scrolls s
       JOIN accounts a ON a.id = s.sender_id
      WHERE s.from_label IS NULL
        AND ((s.sender_id = $1 AND s.recipient_id = $2)
          OR (s.sender_id = $2 AND s.recipient_id = $1))
      ORDER BY s.sent_at ASC`,
    [accountId, partnerId],
  );
  // A scroll still in the air has no body to show, so it shows where its crow
  // has got to instead — the same four lines the Live Activity narrates, so the
  // bubble and the lock screen never disagree. Landed scrolls get an empty
  // array and simply read as themselves.
  const now = Date.now();
  return rows.map((s) => (
    new Date(s.deliver_at).getTime() > now
      ? { ...s, narration: [1, 2, 3, 4].map((phase) => streetMessage(phase, s)) }
      : s
  ));
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

// How long a completed journey (route line + "Arrived" card) lingers on the in-app
// tracker before it reverts to "no crow in flight". The perched unread crows are a
// separate, persistent layer (they stay at their locations until the scroll is
// read), so this only governs the active-journey view.
const CROW_TRACKER_LINGER_MIN = 5;

// Build one tracker flight object from a scroll row. Everything is derived from
// the flight's timestamps (deliver_at / flight_seconds), so progress is purely
// time-based — the crow flies a STRAIGHT LINE from origin to destination, "as the
// crow flies", with no road/street routing.
export function buildCrowFlight(s) {
  const arrivesMs = new Date(s.deliver_at).getTime();
  const startedMs = arrivesMs - (Number(s.flight_seconds) || 0) * 1000;
  const now = Date.now();
  const landed = !!s.delivered || now >= arrivesMs;
  const total = Math.max(1, arrivesMs - startedMs);
  const progress = landed ? 1 : Math.max(0, Math.min(1, (now - startedMs) / total));

  const isForecast = !!s.from_label;
  const distanceKm = haversineKm(s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng) || 0;
  const remainingKm = landed ? 0 : distanceKm * (1 - progress);
  const etaMinutes = landed ? 0 : Math.max(1, Math.ceil(Math.max(0, arrivesMs - now) / 60000));

  // Straight-line interpolation of the crow's current point (fallback for the
  // client; the map itself re-derives it from progress along the origin→dest line).
  const lerp = (a, b) => Number(a) + (Number(b) - Number(a)) * progress;
  const currentLat = landed ? Number(s.dest_lat) : lerp(s.origin_lat, s.dest_lat);
  const currentLng = landed ? Number(s.dest_lng) : lerp(s.origin_lng, s.dest_lng);

  // Subtitle: in flight → "dispatched from …"; landed → the forecast text (weather
  // scrolls only — a normal scroll keeps its reading ceremony in the scroll reader,
  // so we never spill its body here).
  const from = s.from_label || s.origin_label || 'afar';

  // Live street narration — the SAME per-waypoint copy the iOS Live Activity shows
  // ("Probably somewhere over X" → … → "Coming in to land at DEST"), built from the
  // scroll's phases via the shared streetMessage(). The client swaps between these
  // as the crow's smooth progress passes each waypoint (25 / 50 / 75 / 92%), so the
  // in-app tracker narrates identically to the lock-screen activity.
  const narration = landed ? [] : [1, 2, 3, 4].map((ph) => streetMessage(ph, s));

  let message = '';
  if (landed) message = isForecast ? (s.body || '').replace(/\s+/g, ' ').trim() : 'Your scroll has landed.';
  else message = `An Indian Roller is on its way from ${from}`;   // opening line, before waypoint 1

  return {
    id: s.id,
    kind: isForecast ? 'forecast' : 'scroll',
    traveller_name: isForecast ? 'The Indian Roller' : 'An Indian Roller',
    origin_label: s.origin_label,
    dest_label: s.dest_label,
    from_label: s.from_label,
    arrived: landed,
    origin_lat: Number(s.origin_lat), origin_lng: Number(s.origin_lng),
    dest_lat: Number(s.dest_lat), dest_lng: Number(s.dest_lng),
    current_lat: currentLat, current_lng: currentLng,
    // Empty route_points → the client draws a single straight origin→dest line.
    route_points: [],
    progress, route_progress: progress,
    eta_minutes: etaMinutes,
    distance_km: Math.round(remainingKm * 10) / 10,
    message,
    // Per-waypoint narration + the progress marks at which the client should swap
    // to each line (matches the crow's on-map position and the Live Activity).
    narration,
    narration_marks: [...WAYPOINT_FRACS, LANDING_FRAC],
    started_at: new Date(startedMs).toISOString(),
    arrives_at: new Date(arrivesMs).toISOString(),
  };
}

// The caller's active crow flights — powers the in-app /crow-tracker live map (the
// scroll equivalent of OMW's active-trip). Returns ALL crows currently in flight to
// them, plus any that landed in the last few minutes (so the map can show several
// journeys at once + the just-arrived "Arrived" card). Recipient-scoped: a person
// only ever sees scrolls addressed to them.
export async function getActiveCrowFlights(recipientId) {
  const { rows } = await query(
    `SELECT s.id, s.origin_label, s.dest_label, s.from_label, s.body,
            s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.route_streets,
            s.deliver_at, s.flight_seconds, s.delivered, s.delivered_at,
            a.name AS sender_name
       FROM scrolls s JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1
        AND (
          s.deliver_at > NOW()                                                         -- still in flight
          OR (s.from_label IS NULL AND s.delivered = TRUE AND s.delivered_at > NOW() - make_interval(mins => $2))  -- standard: brief "Arrived" linger (the perch then persists via the unread list)
          OR (s.from_label IS NOT NULL AND s.deliver_at >= date_trunc('day', NOW()))   -- forecast (Indian Roller): perch stays all day, time-based so it never blinks out at landing
        )
      ORDER BY s.deliver_at ASC`,
    [recipientId, CROW_TRACKER_LINGER_MIN],
  );
  return rows.map(buildCrowFlight);
}

// One flight, for either participant — what the crow-tracker sheet opens when
// you tap a bubble's progress line. getActiveCrowFlights is recipient-scoped
// (the tracker only ever shows crows coming TO you); here the sender may watch
// their own crow go, because they're looking at the scroll they sent.
export async function getScrollFlight(scrollId, accountId) {
  const { rows } = await query(
    `SELECT s.id, s.sender_id, s.recipient_id,
            s.origin_label, s.dest_label, s.from_label, s.body,
            s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.route_streets,
            s.deliver_at, s.flight_seconds, s.delivered, s.delivered_at,
            a.name AS sender_name
       FROM scrolls s JOIN accounts a ON a.id = s.sender_id
      WHERE s.id = $1 AND (s.sender_id = $2 OR s.recipient_id = $2)`,
    [scrollId, accountId],
  );
  if (!rows[0]) return null;
  // buildCrowFlight only ever puts a body in `message` for forecast scrolls, so
  // a sender watching their own crow still doesn't get the reading ceremony
  // spoiled for the person it's addressed to.
  return buildCrowFlight(rows[0]);
}

// Mark an arrived scroll as seen WITHOUT destroying it.
//
// markRead() is the web app's behaviour: a scroll is ephemeral there, read once
// and gone. The native Messages thread keeps scrolls as bubbles in the
// conversation, so it needs the badge cleared and the row left alone.
export async function markSeen(scrollId, accountId) {
  const { rowCount } = await query(
    `UPDATE scrolls
        SET read_at = NOW()
      WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL AND deliver_at <= NOW()`,
    [scrollId, accountId],
  );
  return rowCount > 0;
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
    const { rows } = await query(`SELECT la_channel_id, la_sandbox FROM scrolls WHERE id = $1`, [scrollId]);
    const channelId = rows[0]?.la_channel_id;
    if (channelId) {
      // End + tear down the broadcast channel.
      sendBroadcast(channelId, { event: 'end', contentState: state, dismissalMs: Date.now(), sandbox: rows[0]?.la_sandbox })
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
      RETURNING id, recipient_id, origin_label, from_label, flight_seconds, body, la_channel_id, la_sandbox`,
  );
  for (const s of rows) {
    try {
      const origin = s.from_label || s.origin_label || 'afar';
      // Forecast scrolls (from the Indian Roller) get their own arrival title.
      const arrivedTitle = s.from_label ? 'An Indian Roller has arrived' : `News from ${origin}.`;
      // The scroll's own text becomes the landed subtitle (widget truncates).
      const preview = (s.body || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      // While muted, finalise silently (no alert) and never raise a banner.
      const muted = await isMuted(s.recipient_id);
      const arrivesAtMs = Date.now();
      const startedAtMs = arrivesAtMs - (Number(s.flight_seconds) || 0) * 1000;
      const state = crowContentState({ startedAtMs, arrivesAtMs, landed: true, message: preview, phase: 4 });
      const alert = muted ? undefined : { title: arrivedTitle, body: preview || 'A bird has arrived' };

      if (s.la_channel_id) {
        // Broadcast the landing to the channel — reaches a closed app, in-scroll.
        await sendBroadcast(s.la_channel_id, { event: 'update', contentState: state, alert, sandbox: s.la_sandbox });
      } else {
        const tokens = await updateTokensFor(s.id);
        if (tokens.length) {
          for (const token of tokens) {
            await sendLiveActivityPush(token, { event: 'update', contentState: state, alert });
          }
        } else {
          // No Live Activity reachable — fall back to the classic alert push.
          // Forecast (Indian Roller) scrolls live only on the tracker, so send
          // there; a normal scroll opens the reader in /messages.
          await sendPush(s.recipient_id, {
            title: arrivedTitle,
            body: preview || 'A bird has arrived',
            url: s.from_label ? '/crow-tracker' : '/messages?scrolls=1',
            tag: 'scroll-arrival',
          });
        }
      }
    } catch { /* push is best-effort */ }
  }
  return rows.length;
}
