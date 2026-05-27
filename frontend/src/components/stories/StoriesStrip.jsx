import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import StoryViewer from './StoryViewer.jsx';
import StoryUploader from './StoryUploader.jsx';

/* Horizontal scrolling row of "story circles" — Instagram-style 24h stories.
   The first cell is the upload "+" button. Then one circle per author who
   has active stories, showing their LATEST story's thumbnail with a gradient
   "unviewed" ring. Tapping a circle opens the viewer for that author's
   sequence of active stories. Polls every 30s to pick up the other party's
   new posts without needing a hard refresh. */
const POLL_MS = 30_000;

function StoryRing({ thumbnailUrl, mediaType, glow, label, sublabel, onClick, plus }) {
  return (
    <button
      onClick={onClick}
      className="flex w-16 shrink-0 flex-col items-center gap-1 focus:outline-none"
      aria-label={label}
    >
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full p-[2.5px] ${
          glow
            ? 'bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400'
            : 'bg-neutral-300'
        }`}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white">
          {plus ? (
            <span className="flex h-full w-full items-center justify-center bg-amber-500 text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          ) : mediaType === 'video' ? (
            <video src={thumbnailUrl} className="h-full w-full object-cover" muted preload="metadata" playsInline />
          ) : (
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          )}
        </span>
      </span>
      <span className="line-clamp-1 max-w-[64px] text-[10px] font-medium text-neutral-700">
        {label}
      </span>
      {sublabel && (
        <span className="line-clamp-1 max-w-[64px] text-[9px] text-neutral-400">{sublabel}</span>
      )}
    </button>
  );
}

export default function StoriesStrip() {
  const { user } = useAuth();
  const [stories, setStories] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerInitial, setViewerInitial] = useState(0);
  const [uploaderOpen, setUploaderOpen] = useState(false);

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
    // Inside each group sort oldest → newest for the viewer.
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

  // Put "your" stories first if any exist, else by most-recent author.
  const ordered = useMemo(() => {
    return [...grouped].sort((a, b) => {
      if (a.authorId === user?.id) return -1;
      if (b.authorId === user?.id) return 1;
      return new Date(b.latest.created_at) - new Date(a.latest.created_at);
    });
  }, [grouped, user?.id]);

  // Flatten the queue we'll feed to the viewer when a circle is tapped.
  function openViewer(authorIdx) {
    const flat = ordered.flatMap((g) => g.all);
    const target = ordered[authorIdx].all[0];
    setViewerInitial(flat.findIndex((s) => s.id === target.id));
    setViewerOpen(true);
  }

  const viewerQueue = useMemo(() => ordered.flatMap((g) => g.all), [ordered]);

  if (ordered.length === 0) {
    return (
      <>
        <div className="-mx-4 px-4">
          <div className="flex gap-3 overflow-x-auto pb-2">
            <StoryRing plus glow={false} label="Add story" onClick={() => setUploaderOpen(true)} />
            <p className="self-center text-xs text-neutral-400">No sneaky stories yet — be the first.</p>
          </div>
        </div>
        {uploaderOpen && (
          <StoryUploader onClose={() => setUploaderOpen(false)} onPosted={refresh} />
        )}
      </>
    );
  }

  return (
    <>
      <div className="-mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto pb-2">
          <StoryRing plus glow={false} label="Add story" onClick={() => setUploaderOpen(true)} />
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
        />
      )}
      {uploaderOpen && (
        <StoryUploader onClose={() => setUploaderOpen(false)} onPosted={refresh} />
      )}
    </>
  );
}
