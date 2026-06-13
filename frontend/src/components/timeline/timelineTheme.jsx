import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Default "cozy fairytale" theme for the Relationship Timeline.
 * Every color lives here so the whole timeline (incl. the Leaflet map)
 * can be re-themed from the admin page without touching component code.
 *
 * These are applied to the DOM as CSS custom properties (see
 * `themeToCssVars`) and consumed via Tailwind's arbitrary value syntax,
 * e.g. `bg-[var(--tl-card-bg)]`.
 */
export const defaultTimelineTheme = {
  // Page
  pageBg: '#09090b', // zinc-950
  pageBgTo: '#18181b', // zinc-900 (gradient end)

  // Central timeline line + glow dots
  lineFrom: '#fb7185', // rose-400
  lineVia: '#e879f9', // fuchsia-400
  lineTo: '#fcd34d', // amber-300
  glow: '#fb7185', // rose-400

  // Milestone dots
  dotBg: '#18181b', // zinc-900
  dotBorder: '#fb7185', // rose-400

  // Cards
  cardBg: 'rgba(24, 24, 27, 0.78)', // zinc-900 / 78%
  cardBorder: 'rgba(63, 63, 70, 0.6)', // zinc-700 / 60%
  cardShadow: 'rgba(244, 63, 94, 0.18)', // rose glow shadow

  // Text
  accent: '#fb7185', // rose-400
  titleText: '#fafafa', // zinc-50
  bodyText: '#d4d4d8', // zinc-300
  dateText: '#a1a1aa', // zinc-400
  mutedText: '#71717a', // zinc-500

  // Player / controls
  controlBg: 'rgba(24, 24, 27, 0.9)',
  controlBorder: 'rgba(63, 63, 70, 0.7)',
  controlAccent: '#fb7185',

  // Leaflet map theming
  mapTheme: 'dark', // 'dark' | 'light'
  mapTileUrlDark:
    'https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png',
  mapTileUrlLight:
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  mapTileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  mapPinColor: '#fb7185', // rose-400
  mapPinGlow: 'rgba(251, 113, 133, 0.55)',
  mapPopupBg: '#18181b',
  mapPopupText: '#fafafa',
  mapTint: '#09090b', // overlay tint applied over tiles for mood
  mapTintOpacity: 0.18,
};

/** Map of theme keys -> CSS custom property names. */
export const TIMELINE_CSS_VAR_MAP = {
  pageBg: '--tl-page-bg',
  pageBgTo: '--tl-page-bg-to',
  lineFrom: '--tl-line-from',
  lineVia: '--tl-line-via',
  lineTo: '--tl-line-to',
  glow: '--tl-glow',
  dotBg: '--tl-dot-bg',
  dotBorder: '--tl-dot-border',
  cardBg: '--tl-card-bg',
  cardBorder: '--tl-card-border',
  cardShadow: '--tl-card-shadow',
  accent: '--tl-accent',
  titleText: '--tl-title',
  bodyText: '--tl-body',
  dateText: '--tl-date',
  mutedText: '--tl-muted',
  controlBg: '--tl-control-bg',
  controlBorder: '--tl-control-border',
  controlAccent: '--tl-control-accent',
  mapPinColor: '--tl-map-pin',
  mapPinGlow: '--tl-map-pin-glow',
  mapPopupBg: '--tl-map-popup-bg',
  mapPopupText: '--tl-map-popup-text',
  mapTint: '--tl-map-tint',
};

/** Convert a theme object into a React `style` object of CSS custom properties. */
export function themeToCssVars(theme) {
  const style = {};
  for (const [key, cssVar] of Object.entries(TIMELINE_CSS_VAR_MAP)) {
    if (theme[key] !== undefined) style[cssVar] = theme[key];
  }
  // Numeric / non-color tokens that some components read directly via JS.
  style['--tl-map-tint-opacity'] = theme.mapTintOpacity ?? defaultTimelineTheme.mapTintOpacity;
  return style;
}

const STORAGE_KEY = 'sneakySocial.timelineTheme';

const TimelineThemeContext = createContext({
  theme: defaultTimelineTheme,
  setTheme: () => {},
  updateTheme: () => {},
  resetTheme: () => {},
});

export function TimelineThemeProvider({ theme: themeProp, children }) {
  const [theme, setTheme] = useState(() => {
    if (themeProp) return { ...defaultTimelineTheme, ...themeProp };
    if (typeof window === 'undefined') return defaultTimelineTheme;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultTimelineTheme, ...JSON.parse(saved) } : defaultTimelineTheme;
    } catch {
      return defaultTimelineTheme;
    }
  });

  // Allow a controlled `theme` prop to override persisted state.
  useEffect(() => {
    if (themeProp) setTheme((prev) => ({ ...prev, ...themeProp }));
  }, [themeProp]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
    } catch {
      // localStorage unavailable - ignore, theme just won't persist
    }
  }, [theme]);

  const updateTheme = (patch) => setTheme((prev) => ({ ...prev, ...patch }));
  const resetTheme = () => setTheme(defaultTimelineTheme);

  const value = useMemo(
    () => ({ theme, setTheme, updateTheme, resetTheme }),
    [theme]
  );

  return (
    <TimelineThemeContext.Provider value={value}>
      {children}
    </TimelineThemeContext.Provider>
  );
}

export function useTimelineTheme() {
  return useContext(TimelineThemeContext);
}
