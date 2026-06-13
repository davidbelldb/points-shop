import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './timeline.css';
import { useTimelineTheme } from './timelineTheme';

/**
 * MilestoneMap
 * ------------
 * Themeable Leaflet map for showing one or more milestone locations.
 * Tile set switches between dark/light based on `theme.mapTheme`
 * ('dark' | 'light'), and pin markers + popups pick up the admin's
 * configured accent colors via CSS variables.
 *
 * Props:
 *  - locations: [{ id, lat, lng, title, date }]  (single pin -> array of 1)
 *  - center / zoom: optional overrides (defaults to fitting all locations)
 *  - height: CSS height (default '14rem')
 *  - interactive: if false, disables zoom/drag (nice for small card previews)
 */
export default function MilestoneMap({
  locations = [],
  center,
  zoom = 14,
  height = '14rem',
  interactive = true,
  className = '',
}) {
  const { theme } = useTimelineTheme();

  const points = locations.filter((l) => l?.lat != null && l?.lng != null);

  const pinIcon = useMemo(() => createPinIcon(theme), [theme.mapPinColor, theme.mapPinGlow]);

  const tileUrl = theme.mapTheme === 'light' ? theme.mapTileUrlLight : theme.mapTileUrlDark;

  const fallbackCenter = center || (points[0] ? [points[0].lat, points[0].lng] : [52.205, 0.119]);

  if (points.length === 0) return null;

  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl border border-[var(--tl-card-border)] ${className}`}
      style={{ height }}
    >
      <MapContainer
        center={fallbackCenter}
        zoom={zoom}
        scrollWheelZoom={interactive}
        dragging={interactive}
        doubleClickZoom={interactive}
        zoomControl={interactive}
        touchZoom={interactive}
        attributionControl={interactive}
        className="h-full w-full"
        style={{ background: 'var(--tl-page-bg)' }}
      >
        <TileLayer
          url={tileUrl}
          attribution={theme.mapTileAttribution}
          className={theme.mapTheme === 'light' ? '' : 'tl-map-dark-tiles'}
        />
        <MapResizer />
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon}>
            {(p.title || p.date) && (
              <Popup>
                <div className="text-sm">
                  {p.title && <div className="font-semibold">{p.title}</div>}
                  {p.date && <div className="text-xs opacity-70">{p.date}</div>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
        {points.length > 1 && <FitBounds points={points} />}
      </MapContainer>

      {/* Mood tint overlay so the map blends with the timeline's theme */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: 'var(--tl-map-tint)',
          opacity: 'var(--tl-map-tint-opacity)',
          mixBlendMode: theme.mapTheme === 'light' ? 'multiply' : 'color',
        }}
      />
    </div>
  );
}

/** Builds a glowing teardrop pin div-icon themed via CSS variables. */
function createPinIcon() {
  const html = `
    <div class="tl-map-pin-wrap">
      <div class="tl-map-pin-glow"></div>
      <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" class="tl-map-pin">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.94 14 24 14 24s14-14.06 14-24C28 6.27 21.73 0 14 0z" fill="var(--tl-map-pin)"/>
        <circle cx="14" cy="14" r="5.5" fill="var(--tl-map-popup-bg)"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'tl-map-pin-icon',
    iconSize: [28, 38],
    iconAnchor: [14, 38],
    popupAnchor: [0, -34],
  });
}

/**
 * Forces Leaflet to re-measure its container after mount. Maps that mount
 * inside animated/transitioning wrappers (e.g. framer-motion cards that fade
 * or scale in) can initialize before the container has its final layout
 * size, leaving tiles stuck at a stale 0x0 grid - pins/popups (which are
 * positioned independently) still show, but tile imagery never appears.
 */
function MapResizer() {
  const map = useMap();

  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(id);
  }, [map]);

  return null;
}

/** Fits the map viewport to all provided points (used for overview maps). */
function FitBounds({ points }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');

  useEffect(() => {
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [32, 32] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
