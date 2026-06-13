import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindowF, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import './timeline.css';
import { useTimelineTheme } from './timelineTheme';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

/**
 * "Shades of Grey" by Adam Krogh, via Snazzy Maps
 * https://snazzymaps.com/style/38/shades-of-grey
 */
const DARK_MAP_STYLE = [
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ saturation: 36 }, { color: '#000000' }, { lightness: 40 }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ visibility: 'on' }, { color: '#000000' }, { lightness: 16 }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.fill', stylers: [{ color: '#000000' }, { lightness: 20 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }, { lightness: 17 }, { weight: 1.2 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 20 }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 21 }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#000000' }, { lightness: 17 }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }, { lightness: 29 }, { weight: 0.2 }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 18 }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 16 }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 19 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 17 }] },
];

/** Light grey counterpart to DARK_MAP_STYLE, for `mapTheme: 'light'`. */
const LIGHT_MAP_STYLE = [
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
];

const containerStyle = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 52.205, lng: 0.119 };

/**
 * MilestoneMap
 * ------------
 * Themeable Google Map (Maps JavaScript API) for showing one or more
 * milestone locations, styled with a SnazzyMaps-style `styles` array that
 * switches between dark/light based on `theme.mapTheme` ('dark' | 'light').
 * Pin markers + popups pick up the admin's configured accent colors.
 *
 * All maps on /timeline are mostly display-only: pan/drag, the map/satellite
 * toggle, Street View ("pegman"), and keyboard shortcuts are disabled so the
 * map reads as a themed illustration rather than an interactive widget. The
 * one exception is zoom - `gestureHandling: 'cooperative'` lets a two-finger
 * pinch zoom the map (one-finger touch still scrolls the page past it), and
 * desktop scroll-zoom requires ctrl/cmd+scroll. Marker click -> InfoWindow
 * still works.
 *
 * Props:
 *  - locations: [{ id, lat, lng, title, date }]  (single pin -> array of 1)
 *  - center / zoom: optional overrides (defaults to fitting all locations)
 *  - height: CSS height (default '14rem')
 */
export default function MilestoneMap({
  locations = [],
  center,
  zoom = 14,
  height = '14rem',
  className = '',
}) {
  const { theme } = useTimelineTheme();
  const [map, setMap] = useState(null);
  const [activeMarkerId, setActiveMarkerId] = useState(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const points = locations.filter((l) => l?.lat != null && l?.lng != null);
  const fallbackCenter = center
    ? { lat: center[0], lng: center[1] }
    : points[0]
      ? { lat: points[0].lat, lng: points[0].lng }
      : DEFAULT_CENTER;

  const mapStyles = theme.mapTheme === 'light' ? LIGHT_MAP_STYLE : DARK_MAP_STYLE;

  const pinIcon = useMemo(() => {
    if (!isLoaded) return null;
    return createPinIcon(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, theme.mapPinColor, theme.mapPinGlow, theme.mapPopupBg]);

  const onLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Fit/center the viewport whenever the point set changes.
  const pointsKey = points.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    if (!map || points.length === 0) return;

    const applyViewport = () => {
      if (points.length > 1) {
        const bounds = new window.google.maps.LatLngBounds();
        points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds, 32);
      } else {
        map.setCenter({ lat: points[0].lat, lng: points[0].lng });
        map.setZoom(zoom);
      }
    };

    applyViewport();

    // Maps that mount inside animated/transitioning wrappers can initialize
    // before the container has its final layout size, so nudge it to
    // re-measure once everything has settled, then re-apply the
    // center/bounds against the now-correct container size (otherwise the
    // initial fitBounds can leave the pins off-center).
    const id = setTimeout(() => {
      window.google.maps.event.trigger(map, 'resize');
      applyViewport();
    }, 150);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pointsKey, zoom]);

  if (points.length === 0) return null;

  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl border border-[var(--tl-card-border)] ${className}`}
      style={{
        height,
        background: 'var(--tl-page-bg)',
        // iOS Safari ignores `overflow: hidden` + `border-radius` for the
        // Google Maps canvas (it's drawn in its own compositing layer).
        // A fully-opaque mask forces Safari onto the masking code path,
        // which *does* respect the radius - this has no visual effect on
        // other browsers, which already clip correctly.
        WebkitMaskImage: '-webkit-radial-gradient(white, white)',
        maskImage: 'radial-gradient(white, white)',
      }}
    >
      {!GOOGLE_MAPS_API_KEY || loadError ? (
        <div className="flex h-full w-full items-center justify-center text-center text-xs text-[var(--tl-muted)]">
          Map unavailable
        </div>
      ) : !isLoaded ? (
        <div className="flex h-full w-full items-center justify-center text-center text-xs text-[var(--tl-muted)]">
          Loading map…
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={fallbackCenter}
          zoom={zoom}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={{
            styles: mapStyles,
            disableDefaultUI: true,
            zoomControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            keyboardShortcuts: false,
            clickableIcons: false,
            disableDoubleClickZoom: true,
            gestureHandling: 'cooperative',
          }}
        >
          {points.map((p) => (
            <MarkerF
              key={p.id}
              position={{ lat: p.lat, lng: p.lng }}
              icon={pinIcon ?? undefined}
              onClick={() => setActiveMarkerId(p.id)}
            >
              {(p.title || p.date) && activeMarkerId === p.id && (
                <InfoWindowF onCloseClick={() => setActiveMarkerId(null)}>
                  <div className="flex items-start gap-3 text-sm">
                    <div className="min-w-0">
                      {p.title && <div className="font-semibold">{p.title}</div>}
                      {p.date && <div className="text-xs opacity-70">{p.date}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMarkerId(null)}
                      aria-label="Close"
                      className="ml-auto shrink-0 cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-current opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                </InfoWindowF>
              )}
            </MarkerF>
          ))}
        </GoogleMap>
      )}

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

/** Builds a glowing teardrop pin icon (SVG data URI) themed via the admin's colors. */
function createPinIcon(theme) {
  const pin = theme.mapPinColor || '#fb7185';
  const glow = theme.mapPinGlow || 'rgba(251, 113, 133, 0.55)';
  const center = theme.mapPopupBg || '#18181b';

  const svg = `
    <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <circle cx="20" cy="14" r="11" fill="${glow}" filter="url(#glow)" />
      <path d="M20 6C12.27 6 6 12.27 6 20c0 9.94 14 24 14 24s14-14.06 14-24C34 12.27 27.73 6 20 6z" fill="${pin}"/>
      <circle cx="20" cy="20" r="5.5" fill="${center}"/>
    </svg>
  `.trim();

  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  return {
    url,
    scaledSize: new window.google.maps.Size(40, 50),
    anchor: new window.google.maps.Point(20, 44),
  };
}
