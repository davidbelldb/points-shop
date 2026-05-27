import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import StoryRing from './StoryRing.jsx';
import StoryViewer from './StoryViewer.jsx';

/* Read-only home-page strip — just the active-story rings, nothing else.
   Uploading + curating lives on /feed now. Returns null when there are no
   active stories so the home page never carves dead space. Polls every
   30s so the other party's posts trickle in without a manual refresh. */
const POLL_MS = 30_000;

export default function StoriesStrip() {
  const { user } = useAuth();
  const [stories, setStories] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitial, setViewerInitial] = useState(0);

  async function refresh() {
    try { setStories(await api.listActiveStories()); }
    catch { /* swallow — strip is non-critical */ }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Group stories by author so each person becomes one circle. Inside the
  // viewer we step through that author's whole sequence chronologically.
  const grouped = useMemo(() => {
    const byAuthor = new Map();
    for (const s of stories) {
      if (!byAuthor.has(s.author_id)) byAuthor.set(s.author_id, []);
      byAuthor.get(s.author_id).push(s);
    }
    for (const arr of byAuthor.values()) {
      arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    return Array.from(byAuthor.entries()).map(([authorId, arr]) => ({
      authorId,
      authorName: arr[0].author_name,
      latest: arr[arr.length - 1],
      all: arr,
    }));
  }, [stories]);

  const ordered = useMemo(() => {
    return [...grouped].sort((a, b) => {
      if (a.authorId === user?.id) return -1;
      if (b.authorId === user?.id) return 1;
      return new Date(b.latest.created_at) - new Date(a.latest.created_at);
    });
  }, [grouped, user?.id]);

  const viewerQueue = useMemo(() => ordered.flatMap((g) => g.all), [ordered]);

  function openViewer(authorIdx) {
    const target = ordered[authorIdx].all[0];
    setViewerInitial(viewerQueue.findIndex((s) => s.id === target.id));
    setViewerOpen(true);
  }

  if (ordered.length === 0) return null;

  return (
    <>
      <div className="-mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ordered.map((g, idx) => (
            <StoryRing
              key={g.authorId}
              thumbnailUrl={g.latest.media_url}
              mediaType={g.latest.media_type}
              glow
              label={g.authorId === user?.id ? 'Your story' : g.authorName}
              sublabel={g.all.length > 1 ? `${g.all.length} new` : null}
              onClick={() => openViewer(idx)}
            />
          ))}
        </div>
      </div>
      {viewerOpen && (
        <StoryViewer
          stories={viewerQueue}
          initialIndex={viewerInitial}
          onClose={() => { setViewerOpen(false); refresh(); }}
          onStoryDeleted={refresh}
        />
      )}
    </>
  );
}
