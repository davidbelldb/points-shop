import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import StoryViewer from '../components/stories/StoryViewer.jsx';

/* The archive view — every expired story, grouped by Year → Month → grid of
   thumbnails. Tapping any thumbnail opens StoryViewer with the whole month's
   stories queued up, starting from the tapped one. */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function groupByMonth(stories) {
  const map = new Map(); // "YYYY-M" → { year, month, stories[] }
  for (const s of stories) {
    const d = new Date(s.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) {
      map.set(key, { year: d.getFullYear(), month: d.getMonth(), stories: [] });
    }
    map.get(key).stories.push(s);
  }
  // Newest month first
  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

function StoryTile({ s, onClick }) {
  return (
    <button onClick={onClick} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
      {s.media_type === 'video' ? (
        <>
          <video src={s.media_url} className="h-full w-full object-cover" muted preload="metadata" playsInline />
          <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">▶</span>
        </>
      ) : (
        <img src={s.media_url} alt="" className="h-full w-full object-cover" />
      )}
    </button>
  );
}

export default function SneakyFeedPage() {
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(null); // { stories, index } | null

  useEffect(() => {
    api.listArchiveStories()
      .then(setArchive)
      .catch((e) => setError(e.message));
  }, []);

  const monthBuckets = useMemo(() => groupByMonth(archive ?? []), [archive]);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sneaky Feed</h1>
        <Link to="/" className="text-sm text-neutral-500">Back to shop</Link>
      </div>
      <p className="text-sm text-neutral-500">Past stories, sorted by month.</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {archive === null && !error && <p className="text-sm text-neutral-500">Loading sneaky highlights…</p>}
      {archive && archive.length === 0 && (
        <p className="text-sm text-neutral-500">Nothing in the vault yet. Post a story and it'll land here in 24 hours.</p>
      )}

      {monthBuckets.map((bucket) => (
        <section key={`${bucket.year}-${bucket.month}`} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            {MONTHS[bucket.month]} {bucket.year}
            <span className="ml-2 text-xs font-normal text-neutral-400">{bucket.stories.length} stor{bucket.stories.length === 1 ? 'y' : 'ies'}</span>
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {bucket.stories.map((s) => (
              <StoryTile key={s.id} s={s} onClick={() => {
                setViewer({
                  stories: bucket.stories.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
                  index: bucket.stories.findIndex((x) => x.id === s.id),
                });
              }} />
            ))}
          </div>
        </section>
      ))}

      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={Math.max(0, viewer.index)}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
