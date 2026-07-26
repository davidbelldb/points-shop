import { query } from '../../db.js';

/*
 * "Marauder's Map" footprints engine.
 *
 * A broadcaster (David, the admin) drops position pings; the trail is the recent
 * pings within the mode's fade window. The CLIENT turns that path into evenly
 * spaced, direction-pointing footprints — the server just stores points + config.
 * One engine, two modes: 'outdoor' (GPS, live) and 'indoor' (UWB, later).
 */

const MODES = new Set(['indoor', 'outdoor']);
const normMode = (m) => (MODES.has(m) ? m : 'outdoor');

// The broadcaster. v1 is David-only, so the trail everyone watches is the admin's.
async function adminAccountId() {
  const { rows } = await query(`SELECT id FROM accounts WHERE role = 'admin' ORDER BY created_at LIMIT 1`);
  return rows[0]?.id ?? null;
}

// Record one footprint ping for the broadcaster.
export async function recordPing(accountId, mode, lat, lng) {
  const m = normMode(mode);
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    const e = new Error('lat/lng required'); e.statusCode = 400; throw e;
  }
  await query(
    `INSERT INTO footprint_pings (account_id, mode, lat, lng) VALUES ($1,$2,$3,$4)`,
    [accountId, m, Number(lat), Number(lng)],
  );
  // Opportunistic cleanup so the table doesn't grow forever (well beyond any fade).
  query(
    `DELETE FROM footprint_pings WHERE account_id = $1 AND mode = $2 AND recorded_at < NOW() - interval '1 day'`,
    [accountId, m],
  ).catch(() => {});
  return { ok: true };
}

export async function getModeSettings(mode) {
  const { rows } = await query(
    `SELECT mode, enabled, trail_length, fade_seconds, spacing_m FROM footprint_settings WHERE mode = $1`,
    [normMode(mode)],
  );
  return rows[0] ?? null;
}

export async function getSettings() {
  const { rows } = await query(`SELECT mode, enabled, trail_length, fade_seconds, spacing_m FROM footprint_settings`);
  const out = {};
  for (const r of rows) out[r.mode] = r;
  return out;
}

const SETTING_COLS = new Set(['enabled', 'trail_length', 'fade_seconds', 'spacing_m']);
export async function updateModeSettings(mode, patch = {}) {
  const m = normMode(mode);
  const sets = []; const vals = []; let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (!SETTING_COLS.has(k)) continue;
    sets.push(`${k} = $${i}`); vals.push(v); i += 1;
  }
  if (sets.length) {
    sets.push('updated_at = NOW()');
    vals.push(m);
    await query(`UPDATE footprint_settings SET ${sets.join(', ')} WHERE mode = $${i}`, vals);
  }
  return getModeSettings(m);
}

// The broadcaster's recent trail for a mode, within its fade window — the raw
// path points (with epoch-ms timestamps) the client draws footprints along.
export async function getTrail(mode) {
  const m = normMode(mode);
  const settings = await getModeSettings(m);
  if (!settings) return { pings: [], settings: null };
  const adminId = await adminAccountId();
  if (!adminId) return { pings: [], settings };
  const { rows } = await query(
    `SELECT lat, lng, (EXTRACT(EPOCH FROM recorded_at) * 1000)::bigint AS t
       FROM footprint_pings
      WHERE account_id = $1 AND mode = $2
        AND recorded_at > NOW() - make_interval(secs => $3)
      ORDER BY recorded_at ASC`,
    [adminId, m, settings.fade_seconds],
  );
  const pings = rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), t: Number(r.t) }));
  return { pings, settings };
}
