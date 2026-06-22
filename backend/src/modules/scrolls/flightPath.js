/*
 * Crow flight-path engine.
 *
 * Given a sender point and a recipient point, returns a believable ROAD-FOLLOWING
 * path for the crow to travel (the "as the crow flies" conceit, but actually
 * winding along real streets so it reads like a Marauder's-Map journey).
 *
 * Uses OSRM (OpenStreetMap routing) — no API key, and consistent with the
 * Nominatim reverse-geocoding the scrolls feature already uses for road names.
 * If routing is unavailable, falls back to a straight great-circle interpolation
 * so the crow always has a path to fly.
 */

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// Straight-line fallback: N evenly spaced points between origin and dest.
function straightPath(oLat, oLng, dLat, dLng, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([oLat + (dLat - oLat) * t, oLng + (dLng - oLng) * t]);
  }
  return pts;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * @param {{originLat,originLng,destLat,destLng}} p
 * @returns {Promise<{source:'roads'|'crow', points:[number,number][], roads:string[], distanceKm:number}>}
 */
export async function buildFlightPath({ originLat, originLng, destLat, destLng }) {
  const o = [Number(originLat), Number(originLng)];
  const d = [Number(destLat), Number(destLng)];
  const valid = o.every(Number.isFinite) && d.every(Number.isFinite);
  if (!valid) {
    return { source: 'crow', points: [], roads: [], distanceKm: 0 };
  }

  const straightKm = haversineKm(o[0], o[1], d[0], d[1]);

  try {
    const url = `${OSRM_BASE}/${o[1]},${o[0]};${d[1]},${d[0]}`
      + `?overview=full&geometries=geojson&steps=true`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error('no route');

    // GeoJSON is [lng, lat]; flip to [lat, lng] for map/animation use.
    const points = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

    // Ordered, de-duplicated list of street names the crow passes over.
    const roads = [];
    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const name = (step.name || '').trim();
        if (name && roads[roads.length - 1] !== name) roads.push(name);
      }
    }

    return {
      source: 'roads',
      points,
      roads,
      distanceKm: (route.distance ?? straightKm * 1000) / 1000,
    };
  } catch {
    // Routing unavailable — fly straight.
    return {
      source: 'crow',
      points: straightPath(o[0], o[1], d[0], d[1]),
      roads: [],
      distanceKm: straightKm,
    };
  }
}
