import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import StoryRing from './StoryRing.jsx';
import StoryViewer from './StoryViewer.jsx';
import ReelManager from './ReelManager.jsx';

/* Home-page strip — three sections, vertical dividers between them:
   1. ACTIVE stories (24h live) — at most two circles since the app only has
      two accounts; one per author with a glow ring.
   2. HIGHLIGHT REELS — flat-ring covers; tap to open the reel manager.
   3. THE VAULT — every archived story as its own circle with a DD/MM date
      label. Sorted newest first.
   The strip hides entirely if there's nothing to show at all. */
const POLL_MS = 30_000;

function Divider() {
  return <div className="my-1 h-14 w-px shrink-0 bg-neutral-200" aria-hidden="true" />;
}
function ddmm(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function StoriesStrip() {
  const { user } = useAuth();
  const [active, setActive]   = useState([]);
  const [reels, setReels]     = useState([]);
  const [archive, setArchive] = useState([]);
  const [viewer, setViewer]   = useState(null); // { stories, index } | null
  const [managingReelId, setManagingReelId] = useState(null);

  async function refresh() {
    try {
      const [a, r, ar] = await Promise.all([
        api.listActiveStories(),
        api.listReels(),
        api.listArchiveStories(),
      ]);
      setActive(a);
      setReels(r);
      setArchive(ar);
    } catch { /* swallow — strip is non-critical */ }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  /* Active grouped by author so each person becomes one circle. Viewer
     advances through the author's whole sequence chronologically. */
  const activeGroups = useMemo(() => {
    const byAuthor = new Map();
    for (const s of active) {
      if (!byAuthor.has(s.author_id)) byAuthor.set(s.author_id, []);
      byAuthor.get(s.author_id).push(s);
    }
    for (const arr of byAuthor.values()) {
      arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    return Array.from(byAuthor.entries())
      .map(([authorId, arr]) => ({
        authorId,
        authorName: arr[0].author_name,
        latest: arr[arr.length - 1],
        all: arr,
      }))
      .sort((a, b) => {
        if (a.authorId === user?.id) return -1;
        if (b.authorId === user?.id) return 1;
        return new Date(b.latest.created_at) - new Date(a.latest.created_at);
      });
  }, [active, user?.id]);

  const activeQueue = useMemo(() => activeGroups.flatMap((g) => g.all), [activeGroups]);

  function openActive(authorIdx) {
    const target = activeGroups[authorIdx].all[0];
    setViewer({ stories: activeQueue, index: activeQueue.findIndex((s) => s.id === target.id) });
  }
  function openArchiveStory(s) {
    // Archive plays as a single-card queue — keeps the date label honest.
    setViewer({ stories: [s], index: 0 });
  }

  const hasAnything = activeGroups.length > 0 || reels.length > 0 || archive.length > 0;
  if (!hasAnything) return null;

  return (
    <>
      <div className="-mx-4 px-4">
        <div className="flex items-start gap-3 overflow-x-auto pb-2">
          {/* Active stories (max 2 — one circle per author) */}
          {activeGroups.map((g, idx) => (
            <StoryRing
              key={`active-${g.authorId}`}
              thumbnailUrl={g.latest.media_url}
              mediaType={g.latest.media_type}
              glow
              label={g.authorId === user?.id ? 'Your story' : g.authorName}
              sublabel={g.all.length > 1 ? `${g.all.length} new` : null}
              onClick={() => openActive(idx)}
            />
          ))}

          {activeGroups.length > 0 && (reels.length > 0 || archive.length > 0) && <Divider />}

          {/* Highlight reels — flat ring with the name underneath */}
          {reels.map((r) => (
            <StoryRing
              key={`reel-${r.id}`}
              thumbnailUrl={r.cover_url}
              mediaType={r.cover_media_type}
              glow={false}
              label={r.name}
              sublabel={`${r.story_count} stor${r.story_count === 1 ? 'y' : 'ies'}`}
              onClick={() => setManagingReelId(r.id)}
            />
          ))}

          {reels.length > 0 && archive.length > 0 && <Divider />}

          {/* Archive vault — every past story as its own circle with date */}
          {archive.map((s) => (
            <StoryRing
              key={`vault-${s.id}`}
              thumbnailUrl={s.media_url}
              mediaType={s.media_type}
              glow={false}
              label={ddmm(s.created_at)}
              onClick={() => openArchiveStory(s)}
            />
          ))}
        </div>
      </div>

      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={viewer.index}
          onClose={() => { setViewer(null); refresh(); }}
          onStoryDeleted={refresh}
        />
      )}

      {managingReelId && (
        <ReelManager
          reelId={managingReelId}
          onClose={() => { setManagingReelId(null); refresh(); }}
          onChanged={refresh}
        />
      )}
    </>
  );
}
