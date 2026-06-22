import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import RichText from './RichText';
import { getMilestoneIcon } from './icons';

/**
 * MilestoneDetailModal
 * ---------------------
 * Full card "read more" popup for a milestone's optional longer
 * description. Pass `milestone` (or `null` to keep it closed) and `onClose`.
 * Closes on backdrop click, the X button, or Escape.
 */
export default function MilestoneDetailModal({ milestone, onClose }) {
  useEffect(() => {
    if (!milestone) return;
    // Remember where the timeline was scrolled. iOS WebKit resets the document
    // scroll to the top when body overflow toggles, which made closing the modal
    // jump back to the top — restoring the position on close keeps the page put.
    const scrollY = window.scrollY;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [milestone, onClose]);

  const Icon = milestone ? getMilestoneIcon(milestone.icon) : null;

  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={milestone.title || 'Milestone details'}
        >
          <motion.div
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-[var(--tl-card-bg)] border-[var(--tl-card-border)] p-5 sm:p-6 shadow-2xl"
            initial={{ scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 rounded-full border border-[var(--tl-card-border)] p-1.5 text-[var(--tl-muted)] hover:text-[var(--tl-accent)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-2 pr-10">
              {Icon && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tl-dot-bg)] border border-[var(--tl-card-border)] text-[var(--tl-accent)]">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              <time className="text-xs sm:text-sm font-medium uppercase tracking-wide text-[var(--tl-date)]">
                {milestone.displayDate || milestone.date}
              </time>
            </div>

            <RichText
              as="h3"
              text={milestone.title}
              className="text-xl sm:text-2xl font-bold text-[var(--tl-title)] mb-3"
            />

            {milestone.media?.url && (
              <img
                src={milestone.media.url}
                alt={milestone.media.alt || milestone.title}
                className="mb-3 w-full rounded-xl border border-[var(--tl-card-border)] object-cover"
              />
            )}

            <RichText
              text={milestone.longDescription || milestone.description}
              className="text-sm sm:text-[0.95rem] text-[var(--tl-body)] text-justify"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
