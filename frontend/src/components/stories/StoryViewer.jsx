import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import AddToReelModal from './AddToReelModal.jsx';

/* Full-screen story player. Renders one story at a time from a flat queue,
   auto-advances after the story's duration_seconds (default 5s for images,
   natural length for video/audio). Tap right half → next, tap left half →
   prev. Bottom strip has quick-emoji buttons and a text reply — both POST
   to /api/messages with reply_to_story_id, so replies land in Sneaky Chat
   threaded to the story they're about. */
const DEFAULT_IMG_DURATION_MS = 5000;
const QUICK_EMOJIS = ['💜', '😍', '😂', '🔥', '😮'];

export default function StoryViewer({ stories: initialStories, initialIndex = 0, onClose, onStoryDeleted }) {
  // Local copy of the queue so we can drop a story after deletion without
  // requiring the parent to re-supply the prop. Parent gets a callback so
  // its own list (strip / archive) can refresh in parallel.
  const [stories, setStories] = useState(initialStories);
  const [idx, setIdx] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentToast, setSentToast] = useState(null); // 'Sent 💜' etc.
  const [reelModalOpen, setReelModalOpen] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  const story = stories[idx];

  // Paint the body black + lock scroll while the viewer is mounted. Stops
  // the home page (or Safari's URL-bar peek-through) bleeding behind the
  // fixed full-screen container on iOS.
  useEffect(() => {
    const prevBg = document.body.style.backgroundColor;
    const prevOverflow = document.body.style.overflow;
    document.body.style.backgroundColor = '#000';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.backgroundColor = prevBg;
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  function advance() {
    setReply('');
    if (idx < stories.length - 1) setIdx(idx + 1);
    else onClose();
  }
  function rewind() {
    setReply('');
    if (idx > 0) setIdx(idx - 1);
  }

  // Either participant can delete any story (shared-content semantics).
  // After delete, drop the story from the local queue and either advance
  // to the next one or close if it was the last.
  async function handleDelete() {
    if (!story) return;
    if (!confirm('Delete this story? It will be removed from the live feed, the archive, and any highlight reels.')) return;
    try {
      await api.deleteStory(story.id);
      onStoryDeleted?.();
      const nextQueue = stories.filter((s) => s.id !== story.id);
      if (nextQueue.length === 0) { onClose(); return; }
      setStories(nextQueue);
      setIdx((curr) => Math.min(curr, nextQueue.length - 1));
    } catch (e) {
      setSentToast(`Delete failed: ${e.message}`);
      setTimeout(() => setSentToast(null), 2500);
    }
  }

  // Progress bar driver — runs whether the story is an image (timer-based)
  // or a video (synced to the video element's currentTime).
  useEffect(() => {
    if (!story) return undefined;
    setProgress(0);
    startedAtRef.current = Date.now();

    // Video and audio both drive progress off their playback time.
    if (story.media_type === 'video' || story.media_type === 'audio') {
      const el = story.media_type === 'video' ? videoRef.current : audioRef.current;
      if (!el) return undefined;
      function tick() {
        if (el.duration > 0) setProgress(Math.min(1, el.currentTime / el.duration));
      }
      const onEnd = () => advance();
      el.addEventListener('timeupdate', tick);
      el.addEventListener('ended', onEnd);
      // Some iOS PWA browsers won't autoplay until you nudge them; the
      // play() call falls through silently if autoplay was already kicked.
      const playPromise = el.play?.();
      if (playPromise?.catch) playPromise.catch(() => {});
      return () => {
        el.removeEventListener('timeupdate', tick);
        el.removeEventListener('ended', onEnd);
      };
    }

    // Images: timer-based progress driven by the poster's chosen duration.
    // Pre-duration-column stories (and anything stored as null) fall back to
    // the 5s default — without the fallback Math.max bumps them to 1s.
    const ms = story.duration_seconds
      ? Math.max(1000, story.duration_seconds * 1000)
      : DEFAULT_IMG_DURATION_MS;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const next = Math.min(1, elapsed / ms);
      setProgress(next);
      if (next >= 1) {
        clearInterval(interval);
        advance();
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, story?.id]);

  // Send a reply (emoji or text). After success we don't auto-advance —
  // matches IG behaviour. Show a small "Sent" toast for 1.2s.
  async function send(text) {
    const trimmed = (text ?? '').trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.sendMessage(`${trimmed}`, story.id);
      setReply('');
      setSentToast(trimmed.length <= 3 ? `Sent ${trimmed}` : 'Reply sent');
      setTimeout(() => setSentToast(null), 1400);
    } catch (e) {
      setSentToast(`Failed: ${e.message}`);
      setTimeout(() => setSentToast(null), 2200);
    } finally {
      setSending(false);
    }
  }

  // Tap to navigate — but ignore taps that land on the reply controls.
  function onTapZone(e, dir) {
    if (e.target.closest('[data-story-controls]')) return;
    dir === 'next' ? advance() : rewind();
  }

  if (!story) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{
        // 100dvh = the *currently visible* viewport (excluding Safari's URL
        // bar when it's showing), so the reply controls always anchor to a
        // tappable spot at the bottom of the screen. The body bg + scroll
        // lock (the effect below) keeps the home page from peeking through
        // any area the viewer doesn't cover.
        height: '100dvh',
        width: '100vw',
      }}
    >
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-3 supports-[padding:env(safe-area-inset-top)]:pt-[calc(env(safe-area-inset-top)+0.25rem)]">
        {stories.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white transition-[width] duration-100"
              style={{ width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%` }}
            />
          </div>
        ))}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/20 text-xs">
            {story.author_photo
              ? <img src={story.author_photo} alt="" className="h-full w-full object-cover" />
              : story.author_name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="text-sm">
            <p className="font-semibold leading-tight">{story.author_name}</p>
            <p className="text-[11px] text-white/70 leading-tight">{relativeTime(story.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setReelModalOpen(true)}
            aria-label="Save to highlight"
            className="rounded-full p-1.5 text-white/80 hover:bg-white/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            aria-label="Delete story"
            className="rounded-full p-1.5 text-white/80 hover:bg-white/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/80 hover:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Media */}
      <div className="relative flex-1 select-none">
        <div className="absolute inset-y-0 left-0 z-10 w-1/3" onClick={(e) => onTapZone(e, 'prev')} />
        <div className="absolute inset-y-0 right-0 z-10 w-2/3" onClick={(e) => onTapZone(e, 'next')} />

        {story.media_type === 'video' ? (
          <video
            ref={videoRef}
            key={story.id}
            src={story.media_url}
            className="absolute inset-0 h-full w-full object-contain"
            autoPlay
            playsInline
            controls={false}
          />
        ) : story.media_type === 'audio' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <span className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400 p-1">
              <span className="flex h-full w-full items-center justify-center rounded-full bg-black/40 text-white">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="8" y1="22" x2="16" y2="22" />
                </svg>
              </span>
            </span>
            <p className="text-sm text-white/80">Voice note from {story.author_name}</p>
            <audio
              ref={audioRef}
              key={story.id}
              src={story.media_url}
              autoPlay
              playsInline
            />
          </div>
        ) : (
          <img
            src={story.media_url}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {story.caption && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            {/* Semi-transparent black banner so captions stay readable over
                light images. backdrop-blur softens the edge a touch. */}
            <span className="inline-block max-w-full rounded-lg bg-black/55 px-3 py-1.5 text-center text-sm font-medium text-white backdrop-blur-sm">
              {story.caption}
            </span>
          </div>
        )}
      </div>

      {/* Reply controls — emoji row + text input */}
      <div
        data-story-controls
        className="space-y-2 px-3 pt-2 pb-3 supports-[padding:env(safe-area-inset-bottom)]:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        <div className="flex justify-around">
          {QUICK_EMOJIS.map((em) => (
            <button
              key={em}
              onClick={() => send(em)}
              disabled={sending}
              className="text-2xl active:scale-90"
              aria-label={`React with ${em}`}
            >
              {em}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); send(reply); }}
          className="flex items-center gap-2"
        >
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={`Reply to ${story.author_name}…`}
            className="h-10 flex-1 rounded-full border border-white/30 bg-white/10 px-4 text-sm text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!reply.trim() || sending}
            className="h-10 rounded-full bg-amber-500 px-4 text-sm font-semibold text-amber-950 disabled:opacity-40"
          >
            Send
          </button>
        </form>
        {sentToast && (
          <p className="text-center text-xs text-white/80">{sentToast}</p>
        )}
      </div>

      {reelModalOpen && story && (
        <AddToReelModal
          storyId={story.id}
          onClose={() => setReelModalOpen(false)}
          onDone={() => {
            setSentToast('Saved to highlight');
            setTimeout(() => setSentToast(null), 1400);
          }}
        />
      )}
    </div>
  );
}

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}
