import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/AuthContext.jsx';
import AddToReelModal from './AddToReelModal.jsx';
import SliderSticker from './SliderSticker.jsx';

/* Full-screen story player. Renders one story at a time from a flat queue,
   auto-advances after the story's duration_seconds (default 5s for images,
   natural length for video/audio). Tap right half → next, tap left half →
   prev. Press-and-hold pauses; releasing resumes. Focusing the reply input
   also pauses, so you can take longer than 5 seconds to type a reply.
   Bottom strip has quick-emoji buttons and a text reply — both POST to
   /api/messages with reply_to_story_id, so replies land in Sneaky Chat
   threaded to the story they're about. The save-to-highlight (bookmark)
   and delete (trash) icons only appear on stories the current user
   authored — Katie can't manage David's stories and vice versa. */
const DEFAULT_IMG_DURATION_MS = 5000;
const QUICK_EMOJIS = ['❤️', '🫦', '🫠', '😂', '🥹', '😮', '💜'];
const LONG_PRESS_MS = 220;
const SWIPE_UP_THRESHOLD = 60;

export default function StoryViewer({ stories: initialStories, initialIndex = 0, onClose, onStoryDeleted }) {
  const { user } = useAuth();
  // Local copy of the queue so we can drop a story after deletion without
  // requiring the parent to re-supply the prop. Parent gets a callback so
  // its own list (strip / archive) can refresh in parallel.
  const [stories, setStories] = useState(initialStories);
  const [idx, setIdx] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sentToast, setSentToast] = useState(null); // { text, kind } | null
  const [reelModalOpen, setReelModalOpen] = useState(false);
  // Active emoji bursts — each burst is 30 floating glyphs of the picked
  // emoji. Cleaned up when the longest particle in the burst finishes.
  const [bursts, setBursts] = useState([]);
  // Pause sources combine — paused if either pressing or the reply input is focused.
  const [pausedByPress, setPausedByPress] = useState(false);
  const [pausedByReply, setPausedByReply] = useState(false);
  const paused = pausedByPress || pausedByReply;

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const replyInputRef = useRef(null);
  const mediaZoneRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef(null);
  const pausedRef = useRef(false);
  // Long-press / tap / swipe-up discrimination.
  const holdTimerRef = useRef(null);
  const wasHeldRef = useRef(false);
  const wasSwipeUpRef = useRef(false);
  const pressStartYRef = useRef(null);

  const story = stories[idx];
  const isMine = !!(story && user?.id && story.author_id === user.id);

  // Keep the pause flag fresh in a ref so the timer interval (closed over
  // its initial value) can early-return on pause.
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Drive video/audio + accumulate paused-ms so progress maths stay sane.
  useEffect(() => {
    if (paused) {
      pauseStartRef.current = Date.now();
      try { videoRef.current?.pause(); } catch { /* noop */ }
      try { audioRef.current?.pause(); } catch { /* noop */ }
    } else if (pauseStartRef.current !== null) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
      try { videoRef.current?.play().catch(() => {}); } catch { /* noop */ }
      try { audioRef.current?.play().catch(() => {}); } catch { /* noop */ }
    }
  }, [paused]);

  // Mark a story as seen the moment it lands in the viewer (skipping
  // stories the current user authored — author self-views don't count).
  // Fire-and-forget; never block the UI on this.
  useEffect(() => {
    if (!story?.id || isMine) return;
    api.markStoryViewed(story.id).catch(() => {});
  }, [story?.id, isMine]);

  // Native touchend listener for the swipe-up gesture. iOS Safari requires
  // programmatic focus() that opens the keyboard to be called from inside
  // a *native* user-gesture handler (touchend / click) — calling it from
  // React's synthetic pointerup doesn't qualify on all iOS versions, so we
  // bind the focus trigger here instead of in the pointer handlers.
  useEffect(() => {
    const el = mediaZoneRef.current;
    if (!el || isMine) return undefined; // author has no reply input to focus
    let startY = null;
    function onDown(e) { startY = e.touches?.[0]?.clientY ?? null; }
    function onUp(e) {
      const sy = startY; startY = null;
      if (sy == null) return;
      const ey = e.changedTouches?.[0]?.clientY ?? null;
      if (ey == null) return;
      if (sy - ey > SWIPE_UP_THRESHOLD) {
        // Inside a native touchend = user activation on iOS = keyboard pops.
        wasSwipeUpRef.current = true;
        replyInputRef.current?.focus();
      }
    }
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchend', onUp, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchend', onUp);
    };
  }, [isMine]);

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
    setPausedByReply(false);
    if (idx < stories.length - 1) setIdx(idx + 1);
    else onClose();
  }
  function rewind() {
    setReply('');
    setPausedByReply(false);
    if (idx > 0) setIdx(idx - 1);
  }

  // Author-only delete — backend also enforces this; the UI hide stops the
  // request being made in the first place.
  async function handleDelete() {
    if (!story || !isMine) return;
    if (!confirm('Delete this story? It will be removed from the live feed and the archive (but stays in any highlight reels).')) return;
    try {
      await api.deleteStory(story.id);
      onStoryDeleted?.();
      const nextQueue = stories.filter((s) => s.id !== story.id);
      if (nextQueue.length === 0) { onClose(); return; }
      setStories(nextQueue);
      setIdx((curr) => Math.min(curr, nextQueue.length - 1));
    } catch (e) {
      flashToast(`Delete failed: ${e.message}`, 'error', 2500);
    }
  }

  // Progress driver — runs once per story, reads pause state through the
  // ref so toggling pause doesn't restart the underlying timer.
  useEffect(() => {
    if (!story) return undefined;
    setProgress(0);
    startedAtRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartRef.current = paused ? Date.now() : null;

    if (story.media_type === 'video' || story.media_type === 'audio') {
      const el = story.media_type === 'video' ? videoRef.current : audioRef.current;
      if (!el) return undefined;
      function tick() {
        if (el.duration > 0) setProgress(Math.min(1, el.currentTime / el.duration));
      }
      const onEnd = () => advance();
      el.addEventListener('timeupdate', tick);
      el.addEventListener('ended', onEnd);
      const playPromise = el.play?.();
      if (playPromise?.catch) playPromise.catch(() => {});
      // Honour pause on initial mount if we somehow open paused.
      if (paused) { try { el.pause(); } catch { /* noop */ } }
      return () => {
        el.removeEventListener('timeupdate', tick);
        el.removeEventListener('ended', onEnd);
      };
    }

    // Images: timer-based progress driven by the poster's chosen duration.
    // Falls back to 5s for null durations (e.g. legacy rows).
    const ms = story.duration_seconds
      ? Math.max(1000, story.duration_seconds * 1000)
      : DEFAULT_IMG_DURATION_MS;
    const interval = setInterval(() => {
      if (pausedRef.current) return; // skip ticks while paused
      const elapsed = Date.now() - startedAtRef.current - pausedAccumRef.current;
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

  function flashToast(text, kind = 'sent', ms = 1500) {
    setSentToast({ text, kind });
    setTimeout(() => setSentToast(null), ms);
  }

  /* Spawn 30 instances of the picked emoji at random positions across the
     bottom of the media area, each with its own size, rotation, horizontal
     sway and rise duration. Removed once the longest particle has finished. */
  function spawnEmojiBurst(emoji) {
    const burstId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const particles = Array.from({ length: 30 }, (_, i) => ({
      id: `${burstId}-${i}`,
      left: 4 + Math.random() * 88,            // 4 → 92 %
      size: 22 + Math.random() * 44,           // 22 → 66 px
      rot: -25 + Math.random() * 50,           // -25 → 25 deg
      sway: -40 + Math.random() * 80,          // -40 → 40 px lateral drift
      delay: Math.random() * 500,              // up to 500ms stagger
      duration: 1700 + Math.random() * 1500,   // 1.7 → 3.2 s
    }));
    setBursts((prev) => [...prev, { id: burstId, emoji, particles }]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burstId));
    }, 3700);
  }

  /* Slider response — fires when the recipient lets go of the handle.
     - For the author viewing their own story: just pop the emoji burst as
       local feedback. We don't send a chat message to themselves.
     - For the recipient: send a chat message linked to the story + sticker,
       with a slider_response payload so the chat preview can render the
       slider at the exact value they chose. */
  async function onSliderCommit(sticker, result, isAuthor, stickerIdx) {
    const emoji = result?.emoji;
    const fallback = result?.value >= 50
      ? (sticker.end_label || 'high')
      : (sticker.start_label || 'low');
    const body = emoji ? `${emoji}` : `${fallback} (${Math.round(result.value)}%)`;
    if (isAuthor) {
      if (emoji) spawnEmojiBurst(emoji);
      else flashToast('Test reply', 'sent', 1200);
      return;
    }
    try {
      const sliderResponse = {
        sticker_index: stickerIdx,
        value: Math.round(result.value),
        emoji: emoji ?? null,
      };
      await api.sendMessage(body, story.id, null, sliderResponse);
      if (emoji) spawnEmojiBurst(emoji);
      else flashToast('Reply sent', 'sent');
    } catch (e) {
      flashToast(`Failed: ${e.message}`, 'error', 2200);
    }
  }

  // Send a reply (emoji or text). Pops a centred animated confirmation so
  // the reaction visibly registers.
  async function send(text) {
    const trimmed = (text ?? '').trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.sendMessage(`${trimmed}`, story.id);
      setReply('');
      setPausedByReply(false);
      // Short reactions (single emoji) get the IG-style burst; longer text
      // replies get the calmer text toast.
      if (trimmed.length <= 3) spawnEmojiBurst(trimmed);
      else flashToast('Reply sent', 'sent');
    } catch (e) {
      flashToast(`Failed: ${e.message}`, 'error', 2200);
    } finally {
      setSending(false);
    }
  }

  /* ===== press / tap discrimination =====
     Pointer down → start a hold timer. If the timer fires before pointer
     up, treat as a long-press and pause. If pointer up happens first,
     clear the timer and let the click handler advance/rewind. We track
     wasHeldRef so the trailing click event after a long-press doesn't
     also advance the story. */
  function pressStart(e) {
    wasHeldRef.current = false;
    wasSwipeUpRef.current = false;
    pressStartYRef.current = e?.clientY ?? null;
    holdTimerRef.current = setTimeout(() => {
      wasHeldRef.current = true;
      setPausedByPress(true);
    }, LONG_PRESS_MS);
  }
  function pressEnd(e) {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (wasHeldRef.current) {
      setPausedByPress(false);
    }
    // Detect a swipe-up gesture so the trailing click doesn't advance/rewind.
    // NOTE: do NOT call replyInputRef.focus() here. On iOS, pointerup fires
    // *before* the native touchend, and a synthetic-event focus() moves DOM
    // focus onto the input without opening the keyboard. That leaves the
    // element already-focused, so the native touchend handler's focus() —
    // the one that actually pops the keyboard — becomes a no-op. Focusing is
    // owned solely by the native touchend listener above.
    if (pressStartYRef.current != null && e?.clientY != null) {
      const dy = pressStartYRef.current - e.clientY;
      if (dy > SWIPE_UP_THRESHOLD) {
        wasSwipeUpRef.current = true;
      }
    }
    pressStartYRef.current = null;
  }
  function onTapZone(e, dir) {
    if (e.target.closest('[data-story-controls]')) return;
    if (wasHeldRef.current || wasSwipeUpRef.current) {
      // Click after a long-press / swipe-up shouldn't also advance/rewind.
      wasHeldRef.current = false;
      wasSwipeUpRef.current = false;
      return;
    }
    dir === 'next' ? advance() : rewind();
  }

  if (!story) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      style={{ height: '100dvh', width: '100vw' }}
    >
      {/* Inline keyframes — keep the viewer self-contained. */}
      <style>{`
        @keyframes storyToastPop {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
          22%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
          34%  { transform: translate(-50%, -50%) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
        }
        @keyframes storyEmojiRise {
          0%   { opacity: 0; transform: translate(0, 0) rotate(var(--rot, 0deg)) scale(0.55); }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--sway, 0), -110vh) rotate(var(--rot, 0deg)) scale(1.05); }
        }
      `}</style>

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
          {/* Author-only controls — only the original poster can save or delete. */}
          {isMine && (
            <>
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
            </>
          )}
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/80 hover:bg-white/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Media */}
      <div ref={mediaZoneRef} className="relative flex-1 select-none">
        <div
          className="absolute inset-y-0 left-0 z-10 w-1/3"
          onClick={(e) => onTapZone(e, 'prev')}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerCancel={pressEnd}
          onPointerLeave={pressEnd}
        />
        <div
          className="absolute inset-y-0 right-0 z-10 w-2/3"
          onClick={(e) => onTapZone(e, 'next')}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerCancel={pressEnd}
          onPointerLeave={pressEnd}
        />

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
            <span className="inline-block max-w-full rounded-lg bg-black/55 px-3 py-1.5 text-center text-sm font-medium text-white backdrop-blur-sm">
              {story.caption}
            </span>
          </div>
        )}

        {/* Sticker layer. The slider sticker uses a wrapper at the sticker's
            (x%, y%) percent of the media area; pointer events inside the
            slider are isolated from the tap-to-advance zones via z-20.
            Author sees a static preview; the other person gets the
            interactive slider that posts a chat reply on release. */}
        {Array.isArray(story.stickers) && story.stickers.map((s, i) => {
          if (!s || s.type !== 'slider') return null;
          return (
            <div
              key={i}
              data-story-controls
              className="absolute z-20"
              style={{
                left: `${Number(s.x) || 50}%`,
                top: `${Number(s.y) || 70}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <SliderSticker
                sticker={s}
                mode="viewer"
                onCommit={(result) => onSliderCommit(s, result, isMine, i)}
              />
            </div>
          );
        })}

        {/* Emoji burst layer — 30 floating glyphs per reaction, rising to
            the top of the media area with random size/rotation/sway. */}
        {bursts.map((b) => (
          <div
            key={b.id}
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
            aria-hidden="true"
          >
            {b.particles.map((p) => (
              <span
                key={p.id}
                className="absolute"
                style={{
                  left: `${p.left}%`,
                  bottom: 0,
                  fontSize: `${p.size}px`,
                  lineHeight: 1,
                  '--rot': `${p.rot}deg`,
                  '--sway': `${p.sway}px`,
                  animation: `storyEmojiRise ${p.duration}ms ease-out ${p.delay}ms forwards`,
                  willChange: 'transform, opacity',
                }}
              >
                {b.emoji}
              </span>
            ))}
          </div>
        ))}

        {/* Text toast for non-emoji confirmations (text replies, reel
            saves) and errors. Mounted with a stable key derived from the
            content so it doesn't remount on parent re-renders. */}
        {sentToast && (
          <div
            key={sentToast.text}
            className="pointer-events-none absolute left-1/2 top-1/2 z-30"
            style={{
              transform: 'translate(-50%, -50%)',
              animation: 'storyToastPop 1.5s ease-out forwards',
            }}
          >
            <div className={`rounded-2xl px-5 py-3 text-center shadow-xl backdrop-blur-md ${
              sentToast.kind === 'error' ? 'bg-red-600/85' : 'bg-black/65'
            }`}>
              <p className="text-sm font-semibold text-white">{sentToast.text}</p>
            </div>
          </div>
        )}

        {/* Subtle "paused" indicator while held */}
        {paused && (
          <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/85 backdrop-blur-sm">
            Paused
          </div>
        )}
      </div>

      {/* Footer — author sees "Seen by …", recipient gets reply controls. */}
      <div
        data-story-controls
        className="space-y-2 px-3 pt-2 pb-3 supports-[padding:env(safe-area-inset-bottom)]:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
      >
        {isMine ? (
          <StorySeenBy story={story} />
        ) : (
          <>
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
                ref={replyInputRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setPausedByReply(true)}
                onBlur={() => setPausedByReply(false)}
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
          </>
        )}
      </div>

      {reelModalOpen && story && (
        <AddToReelModal
          storyId={story.id}
          onClose={() => setReelModalOpen(false)}
          onDone={() => flashToast('Saved to highlight', 'sent', 1500)}
        />
      )}
    </div>
  );
}

/* Author-only footer — surfaces the other participant's view status.
   Shows the viewer's profile photo + "Seen by {name} · {time ago}" if anyone
   else has viewed; "Not seen yet" otherwise. The avatar replaces the old eye
   glyph. Falls back to an initial-letter chip when the viewer has no photo. */
function StorySeenBy({ story }) {
  const viewers = Array.isArray(story.viewers) ? story.viewers : [];
  if (viewers.length === 0) {
    return (
      <p className="py-2 text-center text-xs text-white/70">Not seen yet</p>
    );
  }
  const first = viewers[0];
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-xs text-white/80">
      {first.photo ? (
        <img
          src={first.photo}
          alt=""
          className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-white/40"
        />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold uppercase text-white ring-1 ring-white/40">
          {first.name?.charAt(0) ?? '?'}
        </span>
      )}
      <span>
        Seen by <span className="font-semibold text-white">{first.name}</span>
        <span className="text-white/55"> · {relativeTime(first.viewed_at)}</span>
      </span>
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
