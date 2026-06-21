import { query, pool } from '../../db.js';
import { sendPush } from '../notifications/push.js';

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
  'frame_rate_fps', 'crow_speed_kmh', 'speed_multiplier', 'min_flight_seconds',
  'max_flight_seconds', 'max_chars', 'scroll_font', 'scroll_bg_file',
  'seal_open_file', 'seal_stamped_file', 'send_branch_file', 'land_branch_file',
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
  origin = {}, dest = {},
}) {
  const text = (body ?? '').trim();
  if (!text) { const e = new Error('Scroll body required'); e.statusCode = 400; throw e; }

  const settings = await getSettings();
  if (settings?.max_chars && text.length > settings.max_chars) {
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
        distance_km, flight_seconds, deliver_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW() + ($11 * interval '1 second'))
     RETURNING *`,
    [
      senderId, recipientId, text,
      origin.label ?? null, origin.lat ?? null, origin.lng ?? null,
      dest.label ?? null, dest.lat ?? null, dest.lng ?? null,
      distanceKm, secs,
    ],
  );
  return rows[0];
}

// Recipient's received scrolls (only those whose crow has actually arrived).
export async function listReceived(recipientId) {
  const { rows } = await query(
    `SELECT s.*, a.name AS sender_name, a.username AS sender_username, a.photo_url AS sender_photo
       FROM scrolls s
       JOIN accounts a ON a.id = s.sender_id
      WHERE s.recipient_id = $1
        AND s.deliver_at <= NOW()
      ORDER BY s.deliver_at DESC`,
    [recipientId],
  );
  return rows;
}

// Count of arrived-but-unread scrolls (drives the "crow has arrived" badge).
export async function unreadCount(recipientId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n
       FROM scrolls
      WHERE recipient_id = $1 AND deliver_at <= NOW() AND read_at IS NULL`,
    [recipientId],
  );
  return rows[0]?.n ?? 0;
}

export async function markRead(scrollId, accountId) {
  await query(
    `UPDATE scrolls SET read_at = NOW()
      WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [scrollId, accountId],
  );
  return { ok: true };
}

// Delivery resolver: atomically claim scrolls whose crow has just arrived,
// flip them to delivered, and fire the arrival push. The UPDATE ... RETURNING
// guarantees each scroll is claimed once even if two timers overlap.
export async function resolveDueScrolls() {
  const { rows } = await query(
    `UPDATE scrolls
        SET delivered = TRUE, delivered_at = NOW(), status = 'delivered'
      WHERE delivered = FALSE AND deliver_at <= NOW()
      RETURNING id, sender_id, recipient_id`,
  );
  for (const s of rows) {
    const { rows: who } = await query(`SELECT name FROM accounts WHERE id = $1`, [s.sender_id]);
    const name = who[0]?.name || 'Someone';
    try {
      await sendPush(s.recipient_id, {
        title: 'A crow has arrived',
        body: `${name}'s crow has arrived with important news`,
        url: '/new-chat?scrolls=1',
        tag: 'scroll-arrival',
      });
    } catch { /* push is best-effort */ }
  }
  return rows.length;
}
