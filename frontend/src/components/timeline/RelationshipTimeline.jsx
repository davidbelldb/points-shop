import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import TimelineCard from './TimelineCard';
import TimelinePlayer from './TimelinePlayer';
import MediaLightbox from './MediaLightbox';
import MilestoneMap from './MilestoneMap';
import { themeToCssVars, useTimelineTheme } from './timelineTheme';
import './timeline.css';

const AUTOPLAY_INTERVAL_MS = 4000;

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
  const [isPlaying, setIsPlaying] = useState(false);

  // Progress driven by the milestone currently highlighted via the
  // play/jump controls, measured as a 0-1 fraction of the track's height so
  // the line draws down to exactly that milestone's dot.
  const activeProgress = useMotionValue(0);

  const updateActiveProgress = useCallback(() => {
    const container = containerRef.current;
    const target = itemRefs.current[activeIndex];
    if (!container || !target) return;
    const containerHeight = container.offsetHeight;
    if (!containerHeight) return;
    const dotCenter = target.offsetTop + 16; // matches the dot's `top-2` + half its height
    activeProgress.set(Math.min(1, dotCenter / containerHeight));
  }, [activeIndex, activeProgress]);

  useEffect(() => {
    updateActiveProgress();
    window.addEventListener('resize', updateActiveProgress);
    return () => window.removeEventListener('resize', updateActiveProgress);
  }, [updateActiveProgress, milestones.length]);

  const lineProgress = useSpring(activeProgress, {
    stiffness: 90,
    damping: 25,
    restDelta: 0.001,
  });

  const scrollToIndex = useCallback((index) => {
    const el = itemRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleJump = useCallback(
    (index) => {
      setActiveIndex(index);
      scrollToIndex(index);
    },
    [scrollToIndex]
  );

  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = prev + 1;
        if (next >= milestones.length) {
          setIsPlaying(false);
          return prev;
        }
        scrollToIndex(next);
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying, milestones.length, scrollToIndex]);

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
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 rounded-full bg-[var(--tl-card-border)]"
            style={lineDashStyle}
          />
          {/* Animated "drawn" line - solid (no dashes), grown from the top
              via scaleY so the from/via/to gradient stops compress into
              whatever height is currently visible and the full color
              transition always reads through. */}
          <motion.div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2 origin-top rounded-full bg-gradient-to-b from-[var(--tl-line-from)] via-[var(--tl-line-via)] to-[var(--tl-line-to)]"
            style={{ scaleY: lineProgress }}
          />

          <div className="flex flex-col">
            {milestones.map((milestone, index) => (
              <TimelineCard
                key={milestone.id}
                ref={(el) => (itemRefs.current[index] = el)}
                milestone={milestone}
                side={index % 2 === 0 ? 'left' : 'right'}
                isActive={index === activeIndex}
                onOpenLightbox={(media) =>
                  setLightboxItem({ url: media.url, alt: media.alt || milestone.title })
                }
              />
            ))}
          </div>
        </div>
      </div>

      <TimelinePlayer
        milestones={milestones}
        activeIndex={activeIndex}
        isPlaying={isPlaying}
        onJump={handleJump}
        onTogglePlay={togglePlay}
      />

      <MediaLightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
    </div>
  );
}
