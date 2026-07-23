// Daily weather forecast — fetches today's outlook from Open-Meteo (free, no API
// key; defaults to its best-match blend which includes the UK Met Office model)
// and renders it into the fixed 3-line, ≤70-character scroll template:
//
//   Forecast Today: Overcast
//   H:26, L:16, Uv:8
//   0%

// WMO weather codes → short condition words (kept ≤13 chars so line 1 stays tidy).
const WMO = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 56: 'Icy drizzle', 57: 'Icy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Icy rain', 67: 'Icy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

const round = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

// Build the 3-line body, trimming the condition word if needed to stay ≤70 chars.
export function buildForecastBody({ code, hi, lo, uv, precip }) {
  let condition = WMO[code] ?? 'Mixed';
  const line2 = `H:${round(hi)}, L:${round(lo)}, Uv:${round(uv)}`;
  const line3 = `${round(precip)}%`;
  const compose = (c) => `Forecast Today: ${c}\n${line2}\n${line3}`;
  // Guarantee the whole thing fits in 70 characters.
  while (compose(condition).length > 70 && condition.length > 3) {
    condition = condition.slice(0, -1).trimEnd();
  }
  return compose(condition);
}

// Fetch today's forecast for a lat/lng. Returns the rendered body, or null on
// any failure (so the scheduler can skip rather than send a broken scroll).
export async function fetchForecastBody(lat, lng) {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,'
      + 'uv_index_max,precipitation_probability_max'
      + '&timezone=Europe%2FLondon&forecast_days=1';
    const res = await fetch(url, { headers: { 'User-Agent': 'SneakyStuff/1.0 (forecast scroll)' } });
    if (!res.ok) return null;
    const d = (await res.json())?.daily;
    if (!d || !Array.isArray(d.time) || d.time.length === 0) return null;
    return buildForecastBody({
      code: d.weather_code?.[0],
      hi: d.temperature_2m_max?.[0],
      lo: d.temperature_2m_min?.[0],
      uv: d.uv_index_max?.[0],
      precip: d.precipitation_probability_max?.[0],
    });
  } catch {
    return null;
  }
}
