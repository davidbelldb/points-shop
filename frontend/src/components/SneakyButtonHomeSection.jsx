import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * "Sneaky Button" — admin-toggled homepage button (with day-of-week
 * scheduling, same pattern as Shut the Box 15 / Wheel) that fetches a
 * random, adorable cat/dog picture or gif for Katie.
 */
export default function SneakyButtonHomeSection() {
  const [config, setConfig] = useState(null);
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSneakyButtonConfig().then(setConfig).catch(() => {});
  }, []);

  if (!config || !config.homepage_visible) return null;

  const today = new Date().getDay();
  const days = Array.isArray(config.homepage_days) ? config.homepage_days : [0, 1, 2, 3, 4, 5, 6];
  if (days.length > 0 && !days.includes(today)) return null;

  async function fetchAnimal() {
    setLoading(true); setError(null);
    try {
      const result = await api.getSneakyRandomAnimal();
      setMedia(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={fetchAnimal}
        disabled={loading}
        className="w-full rounded-2xl bg-amber-600 py-3 text-center text-sm font-semibold text-amber-900 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? 'Fetching something cute…' : (config.button_label || '🐾 Sneaky Button')}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {media && (
        <div className="overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-900">
          <img
            src={media.url}
            alt={`A surprise ${media.kind}`}
            className="max-h-80 w-full object-contain"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
