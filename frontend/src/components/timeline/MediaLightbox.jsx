import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';

/**
 * MediaLightbox
 * -------------
 * Full-screen image/gif viewer. Pass `item` as `{ url, alt }` or `null` to
 * close. Closes on backdrop click, the X button, or Escape.
 */
export default function MediaLightbox({ item, onClose }) {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [item, onClose]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={item.alt || 'Photo'}
        >
          <motion.button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full bg-[var(--tl-control-bg)] border border-[var(--tl-control-border)] p-2 text-[var(--tl-title)] hover:text-[var(--tl-accent)] transition-colors"
            aria-label="Close"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
          >
            <X className="h-5 w-5" />
          </motion.button>

          <motion.img
            src={item.url}
            alt={item.alt || ''}
            className="max-h-[90vh] max-w-[95vw] rounded-2xl object-contain shadow-2xl"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            onClick={(e) => e.stopPropagation()}
          />

          {item.alt && (
            <motion.p
              className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm text-[var(--tl-body)] bg-[var(--tl-control-bg)] border border-[var(--tl-control-border)] rounded-full px-4 py-1.5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              {item.alt}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
