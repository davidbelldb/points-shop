import { RotateCcw } from 'lucide-react';
import { defaultTimelineTheme, themeToCssVars, useTimelineTheme } from './timelineTheme';

/**
 * TimelineThemeEditor
 * --------------------
 * Admin-page panel for re-theming the Relationship Timeline. Reads/writes
 * the shared TimelineThemeContext (persisted to localStorage), so changes
 * apply live to any <RelationshipTimeline /> on the page.
 *
 * Drop this inside <TimelineThemeProvider> alongside the timeline, e.g.
 * on a settings page with a live preview.
 */
export default function TimelineThemeEditor() {
  const { theme, updateTheme, resetTheme } = useTimelineTheme();

  return (
    <div
      className="rounded-2xl border bg-[var(--tl-card-bg)] border-[var(--tl-card-border)] p-5 sm:p-6 text-[var(--tl-body)]"
      style={themeToCssVars(theme)}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-[var(--tl-title)]">Timeline Theme</h2>
        <button
          type="button"
          onClick={resetTheme}
          className="flex items-center gap-1.5 rounded-full border border-[var(--tl-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--tl-muted)] hover:text-[var(--tl-accent)] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to default
        </button>
      </div>

      <Section title="Page">
        <ColorField label="Background (top)" value={theme.pageBg} onChange={(v) => updateTheme({ pageBg: v })} />
        <ColorField label="Background (bottom)" value={theme.pageBgTo} onChange={(v) => updateTheme({ pageBgTo: v })} />
      </Section>

      <Section title="Timeline line & glow">
        <ColorField label="Line gradient start" value={theme.lineFrom} onChange={(v) => updateTheme({ lineFrom: v })} />
        <ColorField label="Line gradient middle" value={theme.lineVia} onChange={(v) => updateTheme({ lineVia: v })} />
        <ColorField label="Line gradient end" value={theme.lineTo} onChange={(v) => updateTheme({ lineTo: v })} />
        <ColorField label="Glow accent" value={theme.glow} onChange={(v) => updateTheme({ glow: v })} />
        <ColorField label="Dot background" value={theme.dotBg} onChange={(v) => updateTheme({ dotBg: v })} />
        <ColorField label="Dot border" value={theme.dotBorder} onChange={(v) => updateTheme({ dotBorder: v })} />
        <ColorField label="Active dot background" value={theme.dotActiveBg} onChange={(v) => updateTheme({ dotActiveBg: v })} />
        <ColorField label="Active dot border" value={theme.dotActiveBorder} onChange={(v) => updateTheme({ dotActiveBorder: v })} />
      </Section>

      <Section title="Cards">
        <ColorField label="Card background" value={theme.cardBg} onChange={(v) => updateTheme({ cardBg: v })} withAlpha />
        <ColorField label="Card border" value={theme.cardBorder} onChange={(v) => updateTheme({ cardBorder: v })} withAlpha />
        <ColorField label="Card glow shadow" value={theme.cardShadow} onChange={(v) => updateTheme({ cardShadow: v })} withAlpha />
      </Section>

      <Section title="Text">
        <ColorField label="Accent" value={theme.accent} onChange={(v) => updateTheme({ accent: v })} />
        <ColorField label="Title text" value={theme.titleText} onChange={(v) => updateTheme({ titleText: v })} />
        <ColorField label="Body text" value={theme.bodyText} onChange={(v) => updateTheme({ bodyText: v })} />
        <ColorField label="Date text" value={theme.dateText} onChange={(v) => updateTheme({ dateText: v })} />
        <ColorField label="Muted text" value={theme.mutedText} onChange={(v) => updateTheme({ mutedText: v })} />
      </Section>

      <Section title="Player controls">
        <ColorField label="Control bar background" value={theme.controlBg} onChange={(v) => updateTheme({ controlBg: v })} withAlpha />
        <ColorField label="Control bar border" value={theme.controlBorder} onChange={(v) => updateTheme({ controlBorder: v })} withAlpha />
        <ColorField label="Control accent" value={theme.controlAccent} onChange={(v) => updateTheme({ controlAccent: v })} />
      </Section>

      <Section title="Map">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-[var(--tl-title)]">Map style</span>
          <select
            value={theme.mapTheme}
            onChange={(e) => updateTheme({ mapTheme: e.target.value })}
            className="rounded-lg border border-[var(--tl-card-border)] bg-[var(--tl-page-bg)] text-[var(--tl-body)] text-sm px-2 py-1"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
        <ColorField label="Pin color" value={theme.mapPinColor} onChange={(v) => updateTheme({ mapPinColor: v })} />
        <ColorField label="Pin glow" value={theme.mapPinGlow} onChange={(v) => updateTheme({ mapPinGlow: v })} withAlpha />
        <ColorField label="Popup background" value={theme.mapPopupBg} onChange={(v) => updateTheme({ mapPopupBg: v })} />
        <ColorField label="Popup text" value={theme.mapPopupText} onChange={(v) => updateTheme({ mapPopupText: v })} />
        <ColorField label="Mood tint" value={theme.mapTint} onChange={(v) => updateTheme({ mapTint: v })} />
        <div className="py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-[var(--tl-title)]">Mood tint strength</span>
            <code className="text-xs text-[var(--tl-muted)]">{Math.round((theme.mapTintOpacity ?? 0) * 100)}%</code>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={theme.mapTintOpacity ?? defaultTimelineTheme.mapTintOpacity}
            onChange={(e) => updateTheme({ mapTintOpacity: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--tl-muted)] mb-2">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Color swatch + optional alpha slider, working for both hex and rgba() theme values. */
function ColorField({ label, value, onChange, withAlpha = false }) {
  const { hex, alpha } = parseColor(value);

  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="relative block h-8 w-8 shrink-0 overflow-hidden rounded-full shadow-inner shadow-black/30"
        style={{ backgroundColor: hex }}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(composeColor(e.target.value, alpha))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0"
          aria-label={label}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--tl-title)]">{label}</p>
        {withAlpha && (
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={alpha}
            onChange={(e) => onChange(composeColor(hex, parseFloat(e.target.value)))}
            className="w-full"
          />
        )}
      </div>
      <code className="shrink-0 text-xs text-[var(--tl-muted)]">
        {withAlpha ? `${Math.round(alpha * 100)}%` : hex}
      </code>
    </div>
  );
}

// --- color helpers -------------------------------------------------------

function parseColor(value) {
  if (typeof value !== 'string') return { hex: '#000000', alpha: 1 };

  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((s) => parseFloat(s.trim()));
    const [r, g, b, a = 1] = parts;
    return { hex: rgbToHex(r, g, b), alpha: Number.isFinite(a) ? a : 1 };
  }

  if (value.startsWith('#')) {
    const hex = value.length === 4 ? expandShortHex(value) : value;
    return { hex, alpha: 1 };
  }

  return { hex: '#000000', alpha: 1 };
}

function expandShortHex(hex) {
  const chars = hex.slice(1).split('');
  return `#${chars.map((c) => c + c).join('')}`;
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? expandShortHex(`#${h}`).slice(1) : h;
  const bigint = parseInt(full, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function composeColor(hex, alpha) {
  if (alpha >= 1) return hex;
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}
