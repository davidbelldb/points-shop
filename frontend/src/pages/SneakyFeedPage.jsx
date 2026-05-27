import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import StoryRing from '../components/stories/StoryRing.jsx';
import StoryViewer from '../components/stories/StoryViewer.jsx';
import StoryUploader from '../components/stories/StoryUploader.jsx';

/* Sneaky Feed — the home base for all story content.
   1. "+ Add story" button up top (moved off the home page).
   2. Active stories (24h) as ring circles.
   3. Highlight reels (named collections) as circles with their name underneath.
   4. Past stories archive grid grouped by Year-Month.

   Tapping anything (a story circle, a reel cover, a thumbnail in the archive)
   opens the same shared StoryViewer with the appropriate queue. */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function groupByMonth(stories) {
  const map = new Map();
  for (const s of stories) {
    const d = new Date(s.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map.has(key)) map.set(key, { year: d.getFullYear(), month: d.getMonth(), stories: [] });
    map.get(key).stories.push(s);
  }
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
  const { user } = useAuth();
  const [active, setActive] = useState([]);
  const [archive, setArchive] = useState(null);
  const [reels, setReels] = useState(null);
  const [error, setError] = useState(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [viewer, setViewer] = useState(null); // { stories, index } | null

  async function refresh() {
    try {
      const [a, ar, r] = await Promise.all([
        api.listActiveStories(),
        api.listArchiveStories(),
        api.listReels(),
      ]);
      setActive(a);
      setArchive(ar);
      setReels(r);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  /* Active stories ordered like the home strip — you first, then most recent. */
  const activeOrdered = useMemo(() => {
    const byAuthor = new Map();
    for (const s of active) {
      if (!byAuthor.has(s.author_id)) byAuthor.set(s.author_id, []);
      byAuthor.get(s.author_id).push(s);
    }
    for (const arr of byAuthor.values()) {
      arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    const groups = Array.from(byAuthor.entries()).map(([authorId, arr]) => ({
      authorId,
      authorName: arr[0].author_name,
      latest: arr[arr.length - 1],
      all: arr,
    }));
    return groups.sort((a, b) => {
      if (a.authorId === user?.id) return -1;
      if (b.authorId === user?.id) return 1;
      return new Date(b.latest.created_at) - new Date(a.latest.created_at);
    });
  }, [active, user?.id]);

  const activeQueue = useMemo(() => activeOrdered.flatMap((g) => g.all), [activeOrdered]);

  function openActive(authorIdx) {
    const target = activeOrdered[authorIdx].all[0];
    setViewer({ stories: activeQueue, index: activeQueue.findIndex((s) => s.id === target.id) });
  }

  async function openReel(reelId) {
    try {
      const reel = await api.getReel(reelId);
      if (!reel?.stories?.length) return;
      setViewer({ stories: reel.stories, index: 0 });
    } catch (e) { setError(e.message); }
  }

  const monthBuckets = useMemo(() => groupByMonth(archive ?? []), [archive]);

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sneaky Stories</h1>
        <Link to="/" className="text-sm text-neutral-500">Back to shop</Link>
      </div>

      {/* Add story — the only place this lives now. */}
      <button
        onClick={() => setUploaderOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-700 transition active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span>Add a sneaky story</span>
        <span className="ml-auto text-xs font-normal text-amber-600">Lives 24 hours</span>
      </button>

      {/* Active stories */}
      {activeOrdered.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Active stories</h2>
          <div className="-mx-4 px-4">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {activeOrdered.map((g, idx) => (
                <StoryRing
                  key={g.authorId}
                  thumbnailUrl={g.latest.media_url}
                  mediaType={g.latest.media_type}
                  glow
                  label={g.authorId === user?.id ? 'Your story' : g.authorName}
                  sublabel={g.all.length > 1 ? `${g.all.length} new` : null}
                  onClick={() => openActive(idx)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Highlight reels */}
      {reels && reels.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Highlight reels</h2>
          <div className="-mx-4 px-4">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {reels.map((r) => (
                <StoryRing
                  key={r.id}
                  thumbnailUrl={r.cover_url}
                  mediaType={r.cover_media_type}
                  glow={false}
                  label={r.name}
                  sublabel={`${r.story_count} stor${r.story_count === 1 ? 'y' : 'ies'}`}
                  onClick={() => openReel(r.id)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Past stories archive */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Past stories</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {archive === null && !error && <p className="text-sm text-neutral-500">Loading…</p>}
        {archive && archive.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing in the vault yet. Stories auto-archive here after 24 hours.</p>
        )}

        {monthBuckets.map((bucket) => (
          <div key={`${bucket.year}-${bucket.month}`} className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              {MONTHS[bucket.month]} {bucket.year}
              <span className="ml-2 text-xs font-normal text-neutral-400">{bucket.stories.length} stor{bucket.stories.length === 1 ? 'y' : 'ies'}</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {bucket.stories.map((s) => {
                const queue = bucket.stories.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                const startIdx = queue.findIndex((x) => x.id === s.id);
                return (
                  <StoryTile key={s.id} s={s} onClick={() => setViewer({ stories: queue, index: Math.max(0, startIdx) })} />
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={Math.max(0, viewer.index)}
          onClose={() => { setViewer(null); refresh(); }}
          onStoryDeleted={refresh}
        />
      )}

      {uploaderOpen && (
        <StoryUploader onClose={() => setUploaderOpen(false)} onPosted={refresh} />
      )}
    </div>
  );
}
