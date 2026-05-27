import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';

/* Full-screen story player. Renders one story at a time from a flat queue,
   auto-advances after 5s (image) or the video's duration (video). Tap right
   half → next, tap left half → prev. Bottom strip has quick-emoji buttons
   and a text reply — both POST to /api/messages with reply_to_story_id, so
   replies land in Sneaky Chat threaded to the story they're about. */
const IMG_DURATION_MS = 5000;
const QUICK_EMOJIS = ['💜', '😍', '😂', '🔥', '😮'];

export default function StoryViewer({ stories, initialIndex = 0, onClose }) {
  const [idx, setIdx] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentToast, setSentToast] = useState(null); // 'Sent 💜' etc.
  const videoRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  const story = stories[idx];

  function advance() {
    setReply('');
    if (idx < stories.length - 1) setIdx(idx + 1);
    else onClose();
  }
  function rewind() {
    setReply('');
    if (idx > 0) setIdx(idx - 1);
  }

  // Progress bar driver — runs whether the story is an image (timer-based)
  // or a video (synced to the video element's currentTime).
  useEffect(() => {
    if (!story) return undefined;
    setProgress(0);
    startedAtRef.current = Date.now();

    if (story.media_type === 'video') {
      const v = videoRef.current;
      if (!v) return undefined;
      function tick() {
        if (v.duration > 0) setProgress(Math.min(1, v.currentTime / v.duration));
      }
      v.addEventListener('timeupdate', tick);
      const onEnd = () => advance();
      v.addEventListener('ended', onEnd);
      return () => {
        v.removeEventListener('timeupdate', tick);
        v.removeEventListener('ended', onEnd);
      };
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const next = Math.min(1, elapsed / IMG_DURATION_MS);
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
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
        <button onClick={onClose} aria-label="Close" className="p-1 text-white/80">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
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
        ) : (
          <img
            src={story.media_url}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {story.caption && (
          <p className="absolute inset-x-0 bottom-4 mx-auto max-w-md px-4 text-center text-sm font-medium drop-shadow-md">
            {story.caption}
          </p>
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
