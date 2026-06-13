import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

/**
 * TimelinePlayer
 * --------------
 * Fixed control bar that lets the user "play through" the timeline,
 * milestone by milestone, with prev/next/play controls and a progress bar.
 *
 * Props:
 *  - milestones: full milestone array (for count + current label)
 *  - activeIndex: currently highlighted milestone index
 *  - isPlaying: whether autoplay is running
 *  - onJump(index): go to a specific milestone
 *  - onTogglePlay(): toggle autoplay
 */
export default function TimelinePlayer({ milestones, activeIndex, isPlaying, onJump, onTogglePlay }) {
  if (!milestones?.length) return null;

  const current = milestones[activeIndex] ?? milestones[0];
  const progress = ((activeIndex + 1) / milestones.length) * 100;

  const goPrev = () => onJump(Math.max(0, activeIndex - 1));
  const goNext = () => onJump(Math.min(milestones.length - 1, activeIndex + 1));

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(92vw,32rem)]"
    >
      <div className="rounded-2xl border bg-[var(--tl-control-bg)] border-[var(--tl-control-border)] backdrop-blur-md shadow-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={activeIndex === 0}
            aria-label="Previous milestone"
            className="rounded-full p-2 text-[var(--tl-body)] hover:text-[var(--tl-accent)] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play through timeline'}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tl-control-accent)] text-[var(--tl-page-bg)] shadow-md hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={activeIndex === milestones.length - 1}
            aria-label="Next milestone"
            className="rounded-full p-2 text-[var(--tl-body)] hover:text-[var(--tl-accent)] disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--tl-title)]">{current.title}</p>
            <p className="truncate text-xs text-[var(--tl-date)]">
              {current.displayDate || current.date}
            </p>
          </div>

          <span className="text-xs tabular-nums text-[var(--tl-muted)] shrink-0">
            {activeIndex + 1} / {milestones.length}
          </span>
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--tl-control-border)]">
          <motion.div
            className="h-full rounded-full bg-[var(--tl-control-accent)]"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>
    </motion.div>
  );
}
