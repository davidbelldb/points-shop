import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { hapticTap, hapticSelect } from '../lib/haptics.js';

/*
 * FloatingHead — a draggable profile photo of the other person that floats over
 * the home page. Drag it anywhere; on release it springs back to whichever
 * screen edge is nearest (anchored but floating). Tap it to open /messages.
 *
 * Polish detail: the teal unread bubble orbits the rim of the photo as the head
 * travels across the screen. Anchored left → bubble sits bottom-right; anchored
 * right → bottom-left; and it slides continuously along the bottom arc, passing
 * dead-centre exactly at the 50% horizontal threshold.
 */

const D        = 60;   // head diameter (px)
const R        = D / 2;
const BUBBLE   = 22;   // unread badge diameter (px)
const MARGIN   = 12;   // inset from the screen edge when anchored
const TOP_INSET    = 74;   // keep clear of the header
const BOTTOM_INSET = 104;  // keep clear of the bottom nav / safe area
const TAP_SLOP = 6;    // movement under this = a tap, not a drag
const POLL_MS  = 15000;
const SPRING   = 'transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1)';
const STORE_KEY = 'floatingHead::pos';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}

export default function FloatingHead() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);           // { count, other }
  const [vp, setVp]     = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [dragging, setDragging] = useState(false);

  // Anchored starting position: restore the saved side + vertical fraction,
  // else default to the right edge around two-thirds down.
  const [pos, setPos] = useState(() => {
    const saved = loadSaved();
    const w = window.innerWidth, h = window.innerHeight;
    const side = saved?.side ?? 'right';
    const yFrac = saved?.yFrac ?? 0.62;
    const minY = TOP_INSET, maxY = Math.max(TOP_INSET, h - D - BOTTOM_INSET);
    return {
      x: side === 'left' ? MARGIN : w - D - MARGIN,
      y: clamp(yFrac * h, minY, maxY),
    };
  });

  const posRef = useRef(pos);
  useEffect(() => { posRef.current = pos; }, [pos]);
  const dragRef = useRef(null);

  // --- data: partner photo + unread count, polled + refreshed on focus -------
  const load = useCallback(async () => {
    try {
      const res = await api.messagesUnreadCount();
      if (res?.other) setData(res);
    } catch { /* keep last known */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => { if (document.visibilityState !== 'hidden') load(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  // --- keep on-screen and re-anchored across viewport resizes ----------------
  useEffect(() => {
    function onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      setVp({ w, h });
      setPos((p) => {
        const side = (p.x + D / 2) < w / 2 ? 'left' : 'right';
        const minY = TOP_INSET, maxY = Math.max(TOP_INSET, h - D - BOTTOM_INSET);
        return { x: side === 'left' ? MARGIN : w - D - MARGIN, y: clamp(p.y, minY, maxY) };
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- pointer drag ----------------------------------------------------------
  function onPointerDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      originX: posRef.current.x, originY: posRef.current.y,
      moved: false, downAt: Date.now(),
    };
    setDragging(true);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > TAP_SLOP) d.moved = true;
    const minY = TOP_INSET, maxY = Math.max(TOP_INSET, vp.h - D - BOTTOM_INSET);
    setPos({
      x: clamp(d.originX + dx, 0, vp.w - D),
      y: clamp(d.originY + dy, minY, maxY),
    });
  }

  function onPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (!d) return;

    // A quick, near-stationary press is a tap → open the chat.
    if (!d.moved && Date.now() - d.downAt < 500) {
      hapticTap();
      navigate('/messages');
      return;
    }

    // Otherwise spring back to the nearest edge and remember where we landed.
    setPos((p) => {
      const side = (p.x + D / 2) < vp.w / 2 ? 'left' : 'right';
      const x = side === 'left' ? MARGIN : vp.w - D - MARGIN;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ side, yFrac: p.y / vp.h }));
      } catch { /* ignore */ }
      return { x, y: p.y };
    });
    hapticSelect();
  }

  // --- bubble orbit: angle tracks horizontal fraction (bottom-right→left) ----
  const bubble = useMemo(() => {
    const f = clamp((pos.x + D / 2) / vp.w, 0, 1);
    const ang = ((45 + 90 * f) * Math.PI) / 180; // 45°=bottom-right … 135°=bottom-left
    return {
      x: D / 2 + R * Math.cos(ang) - BUBBLE / 2,
      y: D / 2 + R * Math.sin(ang) - BUBBLE / 2,
    };
  }, [pos.x, vp.w]);

  if (!data?.other) return null;
  const { other, count } = data;
  const transition = dragging ? 'none' : SPRING;

  return (
    <button
      type="button"
      aria-label={`Open chat with ${other.name ?? 'them'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: D,
        height: D,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        transition,
        touchAction: 'none',
        zIndex: 55,
        WebkitTapHighlightColor: 'transparent',
      }}
      className="cursor-grab select-none active:cursor-grabbing"
    >
      {/* Head */}
      <span
        className="block h-full w-full overflow-hidden rounded-full bg-gradient-to-tr from-pink-500 via-amber-500 to-emerald-400 shadow-lg ring-2 ring-white dark:ring-neutral-800"
        style={{
          transform: dragging ? 'scale(1.08)' : 'scale(1)',
          transition: 'transform 200ms ease',
        }}
      >
        {other.photo_url ? (
          <img src={other.photo_url} alt="" draggable={false} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-white">
            {(other.name ?? '?').charAt(0).toUpperCase()}
          </span>
        )}
      </span>

      {/* Unread bubble — orbits the rim as the head travels across the screen */}
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: BUBBLE,
            height: BUBBLE,
            transform: `translate3d(${bubble.x}px, ${bubble.y}px, 0)`,
            transition: dragging ? 'none' : SPRING,
          }}
          className="flex items-center justify-center rounded-full bg-teal-500 text-[11px] font-bold leading-none text-white ring-2 ring-white dark:ring-neutral-800"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
