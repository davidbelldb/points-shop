import { useMemo, useState } from 'react';
import StoryViewer from './StoryViewer.jsx';

/* Featured story — one random story picked from the `stories` pool passed in,
   shown in a rounded square with the image cropped (object-cover) to fill it.
   Tapping opens the full-screen viewer. Re-picks whenever the pool changes
   (e.g. switching calendar months, or a fresh home-page load).

   Two presentations via `variant`:
     - 'home'     : a home-page section with a big "Featured Story" heading
                    matching the other home titles, frame capped to a tidy size.
     - 'calendar' : a bordered card with a small uppercase header + the story's
                    date, sized to sit beside the calendar month grid. */
// Stable hash of today's date (local) — gives a "featured story of the day"
// that's identical wherever it's rendered (home + calendar), as long as the
// same story pool is passed in, and rotates to a new pick each day.
function todaySeed() {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

export default function FeaturedStory({ stories, variant = 'home', className = '' }) {
  const [viewer, setViewer] = useState(null);

  // Deterministic per-day pick (not random) so the home page and the calendar
  // surface the exact same featured story for a given month's pool.
  const featured = useMemo(() => {
    if (!stories || stories.length === 0) return null;
    return stories[todaySeed() % stories.length];
  }, [stories]);

  // Nothing to feature — render nothing at all.
  if (!stories || stories.length === 0 || !featured) return null;

  const dateLabel = new Date(featured.created_at)
    .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const frame = (
    <button
      onClick={() => setViewer({ stories: [featured], index: 0 })}
      className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100"
    >
      {featured.media_type === 'video' ? (
        featured.thumbnail_url
          ? <img src={featured.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          : <video src={featured.media_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
      ) : (
        <img src={featured.media_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      )}
      {featured.caption && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left">
          <p className="line-clamp-2 text-sm font-medium text-white">{featured.caption}</p>
        </div>
      )}
    </button>
  );

  const viewerEl = viewer && (
    <StoryViewer stories={viewer.stories} initialIndex={0} onClose={() => setViewer(null)} />
  );

  if (variant === 'calendar') {
    return (
      <section className={className}>
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Featured story</h2>
            <span className="text-[11px] text-neutral-400">{dateLabel}</span>
          </div>
          {frame}
        </div>
        {viewerEl}
      </section>
    );
  }

  // 'home'
  return (
    <section className={className}>
      <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Featured Story</h2>
      <div className="mt-3 w-full max-w-sm">{frame}</div>
      {viewerEl}
    </section>
  );
}
