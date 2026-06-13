import { useEffect, useRef, useState } from 'react';
import { motion, useSpring } from 'framer-motion';
import TimelineCard from './TimelineCard';
import MediaLightbox from './MediaLightbox';
import MilestoneMap from './MilestoneMap';
import { themeToCssVars, useTimelineTheme } from './timelineTheme';
import './timeline.css';

// Shared dash pattern for the central track + its "drawn" gradient fill, so
// the fill lines up with the dashes exactly as it grows.
const LINE_DASH_MASK = 'repeating-linear-gradient(to bottom, #000 0, #000 8px, transparent 8px, transparent 16px)';
const lineDashStyle = { maskImage: LINE_DASH_MASK, WebkitMaskImage: LINE_DASH_MASK };

/**
 * RelationshipTimeline
 * ---------------------
 * Polished, themeable, scroll-animated relationship milestone timeline.
 *
 * Props:
 *  - milestones: Array<{
 *      id, date, displayDate?, title, description, icon,
 *      media?: { url, type: 'image'|'gif', alt?, size?: 'sm'|'md'|'lg'|'full' },
 *      location?: { lat, lng },
 *    }>
 *  - theme: optional partial theme override (see timelineTheme.js)
 *  - title: heading text shown at the top (defaults to "Our Story So Far")
 *  - subtitle: subheading text shown below the title
 *  - showOverviewMap: render a combined map of every located milestone at the top
 *  - className: extra classes for the outer wrapper
 *
 * Reads its colors from TimelineThemeContext. Wrap the page in
 * <TimelineThemeProvider> (see timelineTheme.js) so this component and an
 * optional <TimelineThemeEditor /> share live, persisted theme state. If no
 * provider is present, the built-in default theme is used.
 */
export default function RelationshipTimeline({
  milestones = [],
  title = 'Our Story So Far',
  subtitle = 'Every little moment, mapped out one milestone at a time.',
  showOverviewMap = true,
  className = '',
}) {
  const { theme } = useTimelineTheme();
  const containerRef = useRef(null);
  const itemRefs = useRef([]);

  const [lightboxItem, setLightboxItem] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Track each milestone's vertical position so the central line can fill
  // in exactly down to whichever dot is currently active. Re-measured
  // whenever the timeline's overall height changes (e.g. lazy images
  // loading in, or a viewport resize that reflows the layout).
  const [dotOffsets, setDotOffsets] = useState([]);

  useEffect(() => {
    const measure = () => {
      // +48 = the dot's `top-10` offset (40px) plus half its `h-4` height
      // (8px), landing on the dot's vertical centre.
      setDotOffsets(itemRefs.current.map((el) => (el ? el.offsetTop + 48 : 0)));
    };
    measure();

    if (typeof ResizeObserver === 'undefined' || !containerRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [milestones.length]);

  // Highlight whichever milestone is currently nearest the centre of the
  // viewport as "active", so its dot fills in and its card is emphasised.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = itemRefs.current.indexOf(entry.target);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    itemRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [milestones.length]);

  // The line "draws" down to the active dot's centre, springing smoothly to
  // its new target each time `activeIndex` changes on scroll. Starts at 0,
  // so on load it only reaches the first dot - not however far down the
  // page happens to render on first paint.
  const lineHeight = useSpring(dotOffsets[activeIndex] ?? 0, {
    stiffness: 90,
    damping: 25,
    restDelta: 0.5,
  });

  const overviewLocations = milestones
    .filter((m) => m.location?.lat != null && m.location?.lng != null)
    .map((m) => ({
      id: m.id,
      lat: m.location.lat,
      lng: m.location.lng,
      title: m.title,
      date: m.displayDate || m.date,
    }));

  return (
    <div
      className={`min-h-screen w-full bg-gradient-to-b from-[var(--tl-page-bg)] to-[var(--tl-page-bg-to)] px-4 sm:px-6 pt-4 sm:pt-6 pb-12 sm:pb-16 ${className}`}
      style={themeToCssVars(theme)}
    >
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[var(--tl-title)]">
            {title}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-[var(--tl-muted)]">
            {subtitle}
          </p>
        </header>

        {showOverviewMap && overviewLocations.length > 0 && (
          <MilestoneMap locations={overviewLocations} className="mb-12" height="10rem" />
        )}

        <div ref={containerRef} className="relative">
          {/* Central line track (dashed) */}
          <div
            className="absolute left-3 md:left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 rounded-full bg-[var(--tl-line-track)]"
            style={lineDashStyle}
          />
          {/* Animated "drawn" line - solid (no dashes), grown from the top
              by animating its height down to the active dot, so the
              from/via/to gradient stops compress into whatever height is
              currently visible and the full color transition always reads
              through. */}
          <motion.div
            className="absolute left-3 md:left-1/2 top-0 w-[2px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[var(--tl-line-from)] via-[var(--tl-line-via)] to-[var(--tl-line-to)]"
            style={{ height: lineHeight }}
          />

          <div className="flex flex-col">
            {milestones.map((milestone, index) => (
              <TimelineCard
                key={milestone.id}
                ref={(el) => (itemRefs.current[index] = el)}
                milestone={milestone}
                side={index % 2 === 0 ? 'left' : 'right'}
                isActive={index === activeIndex}
                isPassed={index < activeIndex}
                onOpenLightbox={(media) =>
                  setLightboxItem({ url: media.url, alt: media.alt || milestone.title })
                }
              />
            ))}
          </div>
        </div>
      </div>

      <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </div>
  );
}
