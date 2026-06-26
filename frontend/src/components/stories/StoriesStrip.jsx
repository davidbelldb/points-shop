import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { getCached, setCached } from '../../lib/swrCache.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import StoryRing from './StoryRing.jsx';
import StoryViewer from './StoryViewer.jsx';

/* Home-page strip — three sections, vertical dividers between them:
   1. ACTIVE stories (24h live) — at most two circles since the app only has
      two accounts; one per author with a glow ring.
   2. HIGHLIGHT REELS — flat-ring covers; tap to open the reel manager.
   3. THE VAULT — archived stories from the last VAULT_WINDOW_DAYS as their
      own circles with a DD/MM date label. Sorted newest first.
   The strip hides entirely if there's nothing to show at all. */
const POLL_MS = 30_000;
// The vault used to fetch the ENTIRE all-time archive on every 30s poll —
// the query and the rendered circle list both grew a little more every
// week as stories expired into it, which is why the home page kept getting
// slower over time. The home strip only needs "recent" memories; the full
// history is still browsable on the Sneaky Feed page's month-grouped view.
const VAULT_WINDOW_DAYS = 14;

function Divider() {
  return <div className="my-1 h-14 w-px shrink-0 bg-neutral-200" aria-hidden="true" />;
}
function ddmm(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Local calendar-day key (Y-M-D) so stories posted on the same day collapse
// into one circle regardless of time. Uses local components, not the ISO
// string, to match what the DD/MM label shows the user.
function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default function StoriesStrip() {
  const { user } = useAuth();
  const [active, setActive]   = useState([]);
  const [reels, setReels]     = useState([]);
  const [archive, setArchive] = useState([]);
  const [viewer, setViewer]   = useState(null); // { stories, index } | null

  // Active stories + reels change frequently (new posts, views) and are
  // cheap to fetch — keep polling these every 30s.
  async function refreshLive() {
    try {
      // Home strip shows EVERYONE'S published reels (David + Katie). The
      // /stories management page is the per-account view.
      const [a, r] = await Promise.all([
        api.listActiveStories(),
        api.listReels({ scope: 'all' }),
      ]);
      setCached('stories:live', { active: a, reels: r });
      setActive(a);
      setReels(r);
    } catch { /* swallow — strip is non-critical */ }
  }

  // Archived stories are immutable once expired — no need to poll them.
  // Bound to a recent window so this stays a cheap, indexed query
  // (created_at) instead of scanning the entire all-time archive.
  async function refreshArchive() {
    try {
      const to = new Date();
      to.setDate(to.getDate() + 1); // include anything that expired earlier today
      const from = new Date();
      from.setDate(from.getDate() - VAULT_WINDOW_DAYS);
      const ar = await api.listArchiveStories(from.toISOString(), to.toISOString());
      setCached('stories:archive', ar);
      setArchive(ar);
    } catch { /* swallow — strip is non-critical */ }
  }

  async function refresh() {
    await Promise.all([refreshLive(), refreshArchive()]);
  }

  useEffect(() => {
    // Repaint instantly from the last response (see swrCache.js) so
    // returning to "/" doesn't blank out the strip while it reloads —
    // then refresh() still runs to pick up anything new.
    const cachedLive = getCached('stories:live');
    if (cachedLive) {
      setActive(cachedLive.active);
      setReels(cachedLive.reels);
    }
    const cachedArchive = getCached('stories:archive');
    if (cachedArchive) setArchive(cachedArchive);

    refresh();
    const id = setInterval(refreshLive, POLL_MS);
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

  /* Vault grouped by calendar day so multiple stories from the same date
     collapse into a single dated circle. The cover is that day's most recent
     story; tapping plays the whole day chronologically. Days are ordered
     newest-first. */
  const archiveGroups = useMemo(() => {
    const byDay = new Map();
    for (const s of archive) {
      const key = dayKey(s.created_at);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(s);
    }
    for (const arr of byDay.values()) {
      arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    return Array.from(byDay.entries())
      .map(([key, arr]) => ({
        key,
        label: ddmm(arr[0].created_at),
        stories: arr,
        cover: arr[arr.length - 1],
      }))
      .sort((a, b) => new Date(b.cover.created_at) - new Date(a.cover.created_at));
  }, [archive]);

  function openActive(authorIdx) {
    const target = activeGroups[authorIdx].all[0];
    setViewer({ stories: activeQueue, index: activeQueue.findIndex((s) => s.id === target.id) });
  }
  function openArchiveDay(group) {
    // A dated circle plays every story from that day, oldest → newest. All
    // share the same DD/MM, so the date label stays honest across the queue.
    setViewer({ stories: group.stories, index: 0 });
  }
  // Home strip just PLAYS reels (your own or the other person's). The
  // manager lives on /stories where you can only see your own reels.
  async function openReel(reelId) {
    try {
      const reel = await api.getReel(reelId);
      if (!reel?.stories?.length) return;
      setViewer({ stories: reel.stories, index: 0 });
    } catch { /* swallow */ }
  }

  // Home page hides empty reels — creating a shell reel from the Stories
  // page is the curation step, but until it has stories the home strip
  // shouldn't carry a hollow circle.
  const visibleReels = useMemo(() => reels.filter((r) => (r.story_count || 0) > 0), [reels]);

  const hasAnything = activeGroups.length > 0 || visibleReels.length > 0 || archive.length > 0;
  if (!hasAnything) return null;

  // All circles in one flat list for the grid layout
  const allCircles = [
    ...activeGroups.map((g, idx) => {
      const isYou = g.authorId === user?.id;
      const allSeenByMe = !isYou && g.all.every((s) => s.viewed_by_me);
      return (
        <StoryRing
          key={`active-${g.authorId}`}
          thumbnailUrl={g.latest.author_photo}
          mediaType="image"
          glow={!allSeenByMe}
          label={isYou ? 'Your story' : g.authorName}
          sublabel={g.all.length > 1 ? `${g.all.length} new` : null}
          onClick={() => openActive(idx)}
        />
      );
    }),
    ...visibleReels.map((r) => (
      <StoryRing
        key={`reel-${r.id}`}
        posterUrl={r.cover_thumbnail_url}
        thumbnailUrl={r.cover_url}
        mediaType={r.cover_media_type}
        glow={false}
        label={r.name}
        sublabel={`${r.story_count} stor${r.story_count === 1 ? 'y' : 'ies'}`}
        onClick={() => openReel(r.id)}
      />
    )),
    ...archiveGroups.map((g) => (
      <StoryRing
        key={`vault-${g.key}`}
        posterUrl={g.cover.thumbnail_url}
        thumbnailUrl={g.cover.media_url}
        mediaType={g.cover.media_type}
        glow={false}
        label={g.label}
        sublabel={g.stories.length > 1 ? `${g.stories.length} stories` : null}
        onClick={() => openArchiveDay(g)}
      />
    )),
  ];

  return (
    <>
      {/* Mobile: single-row horizontal scroll with right bleed (unchanged). */}
      <div className="lg:hidden -mr-4">
        <div className="no-scrollbar flex items-start gap-3 overflow-x-auto pb-2">
          {activeGroups.map((g, idx) => {
            const isYou = g.authorId === user?.id;
            const allSeenByMe = !isYou && g.all.every((s) => s.viewed_by_me);
            return (
              <StoryRing
                key={`active-${g.authorId}`}
                thumbnailUrl={g.latest.author_photo}
                mediaType="image"
                glow={!allSeenByMe}
                label={isYou ? 'Your story' : g.authorName}
                sublabel={g.all.length > 1 ? `${g.all.length} new` : null}
                onClick={() => openActive(idx)}
              />
            );
          })}
          {activeGroups.length > 0 && (visibleReels.length > 0 || archive.length > 0) && <Divider />}
          {visibleReels.map((r) => (
            <StoryRing
              key={`reel-${r.id}`}
              posterUrl={r.cover_thumbnail_url}
              thumbnailUrl={r.cover_url}
              mediaType={r.cover_media_type}
              glow={false}
              label={r.name}
              sublabel={`${r.story_count} stor${r.story_count === 1 ? 'y' : 'ies'}`}
              onClick={() => openReel(r.id)}
            />
          ))}
          {visibleReels.length > 0 && archive.length > 0 && <Divider />}
          {archiveGroups.map((g) => (
            <StoryRing
              key={`vault-${g.key}`}
              posterUrl={g.cover.thumbnail_url}
              thumbnailUrl={g.cover.media_url}
              mediaType={g.cover.media_type}
              glow={false}
              label={g.label}
              sublabel={g.stories.length > 1 ? `${g.stories.length} stories` : null}
              onClick={() => openArchiveDay(g)}
            />
          ))}
        </div>
      </div>

      {/* Tablet / desktop — same circles at natural size, wrapping into rows.
          flex-wrap keeps each ring its true width (74px + label) so the
          spacing looks identical to the iPhone strip, just without the scroll. */}
      <div className="no-scrollbar hidden lg:flex lg:gap-x-4 lg:overflow-x-auto lg:pb-2">
        {allCircles}
      </div>

      {viewer && (
        <StoryViewer
          stories={viewer.stories}
          initialIndex={viewer.index}
          onClose={() => { setViewer(null); refresh(); }}
          onStoryDeleted={refresh}
        />
      )}

    </>
  );
}
