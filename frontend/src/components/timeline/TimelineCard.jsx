import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import RichText from './RichText';
import MilestoneMap from './MilestoneMap';
import { getMilestoneIcon } from './icons';

const MEDIA_SIZE_CLASSES = {
  sm: 'max-w-[160px]',
  md: 'max-w-[280px]',
  lg: 'max-w-[420px]',
  full: 'max-w-full w-full',
};

/**
 * TimelineCard
 * ------------
 * A single milestone card. Slides in from the side it sits on as it enters
 * the viewport, gently scales on hover, and renders rich-text title/body,
 * optional media (with lightbox trigger) and an optional themed mini-map.
 *
 * Props:
 *  - milestone: { id, date, displayDate, title, description, icon, media, location }
 *  - side: 'left' | 'right' (desktop alignment)
 *  - isActive: highlights the card (used by the play-through controls)
 *  - onOpenLightbox(media)
 */
const TimelineCard = forwardRef(function TimelineCard(
  { milestone, side = 'left', isActive = false, onOpenLightbox },
  ref
) {
  const Icon = getMilestoneIcon(milestone.icon);
  const fromSide = side === 'right' ? 60 : -60;
  const media = milestone.media;
  const mediaSizeClass = MEDIA_SIZE_CLASSES[media?.size] || MEDIA_SIZE_CLASSES.md;

  return (
    <div ref={ref} data-milestone-id={milestone.id} className="relative flex w-full items-start">
      {/* Spacer that pushes the card to the opposite half on desktop */}
      {side === 'right' && <div className="hidden md:block md:w-1/2" />}

      {/* Glowing dot on the central line */}
      <div className="absolute left-4 top-2 md:left-1/2 -translate-x-1/2 z-10">
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full bg-[var(--tl-glow)] blur-sm animate-pulse" />
          <div
            className={`relative h-4 w-4 rounded-full border-2 bg-[var(--tl-dot-bg)] transition-colors ${
              isActive ? 'border-[var(--tl-accent)] scale-125' : 'border-[var(--tl-dot-border)]'
            }`}
          />
        </div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, x: fromSide, y: 20 }}
        whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        whileHover={{ scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        className={`ml-12 w-full md:ml-0 md:w-1/2 ${
          side === 'right' ? 'md:pl-10' : 'md:pr-10'
        } pb-12`}
      >
        <div
          className={`rounded-2xl border bg-[var(--tl-card-bg)] border-[var(--tl-card-border)] p-5 sm:p-6 shadow-lg transition-shadow ${
            isActive ? 'ring-2 ring-[var(--tl-accent)]' : ''
          }`}
          style={{ boxShadow: '0 8px 30px var(--tl-card-shadow)' }}
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tl-dot-bg)] border border-[var(--tl-card-border)] text-[var(--tl-accent)]">
              <Icon className="h-5 w-5" />
            </span>
            <time className="text-xs sm:text-sm font-medium uppercase tracking-wide text-[var(--tl-date)]">
              {milestone.displayDate || milestone.date}
            </time>
          </div>

          <RichText
            as="h3"
            text={milestone.title}
            className="text-lg sm:text-xl font-bold text-[var(--tl-title)] mb-1.5"
          />

          <RichText
            text={milestone.description}
            className="text-sm sm:text-[0.95rem] text-[var(--tl-body)]"
          />

          {media?.url && (
            <button
              type="button"
              onClick={() => onOpenLightbox?.(media)}
              className={`mt-4 block overflow-hidden rounded-xl border border-[var(--tl-card-border)] ${mediaSizeClass} group`}
            >
              <img
                src={media.url}
                alt={media.alt || milestone.title}
                className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </button>
          )}

          {milestone.location && (
            <MilestoneMap
              className="mt-4"
              height="9rem"
              interactive={false}
              locations={[
                {
                  id: milestone.id,
                  lat: milestone.location.lat,
                  lng: milestone.location.lng,
                  title: milestone.title,
                  date: milestone.displayDate || milestone.date,
                },
              ]}
            />
          )}
        </div>
      </motion.div>

      {/* Spacer that pushes the card to the opposite half on desktop */}
      {side === 'left' && <div className="hidden md:block md:w-1/2" />}
    </div>
  );
});

export default TimelineCard;
