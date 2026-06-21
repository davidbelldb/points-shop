// Scroll/crow art lives in frontend/public/scrolls/. The DB stores bare
// filenames (e.g. "crow_send_00.png"); the frontend resolves them to a URL.
// Until the real sprites are dropped in, <CrowFrame> falls back to a visible
// placeholder so the animation logic is fully testable.

export const SCROLL_ASSET_BASE = '/scrolls/';

export function assetUrl(file) {
  if (!file) return null;
  if (/^(https?:)?\/\//.test(file) || file.startsWith('/')) return file;
  return `${SCROLL_ASSET_BASE}${file}`;
}

// Great-circle distance (km). Mirrors the backend haversine so the compose
// modal can preview flight time before sending.
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

// Convert a distance to the real-world delivery delay (seconds), applying the
// admin speed multiplier + clamps. Mirrors scrolls.repo.js flightSeconds().
export function flightSeconds(distanceKm, settings = {}) {
  const speedKmh = Number(settings.crow_speed_kmh) || 45;
  const multiplier = Number(settings.speed_multiplier) || 1;
  const min = Number(settings.min_flight_seconds) || 0;
  const max = Number(settings.max_flight_seconds) || 86400;
  const real = ((distanceKm / speedKmh) * 3600) / multiplier;
  return Math.round(Math.min(max, Math.max(min, real)));
}

// Human "2h 14m" / "45s" formatter for flight previews.
export function humanizeSeconds(total) {
  total = Math.max(0, Math.round(total));
  if (total < 60) return `${total}s`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s ? `${s}s` : ''}`.trim();
  return `${m}m`;
}
