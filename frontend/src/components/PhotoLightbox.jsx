import { useEffect, useRef, useState } from 'react';

/*
 * Full-screen photo viewer with pinch-to-zoom + momentum, double-tap zoom,
 * tap-the-dark-surround to close, and swipe-down-to-close. Extracted from the
 * chat lightbox so other features (e.g. the crossword photo reward) reuse the
 * exact same feel. Props: { src, onClose }.
 */
export default function PhotoLightbox({ src, onClose }) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const stateRef = useRef({
    scale: 1, tx: 0, ty: 0,
    vx: 0, vy: 0,
    pointers: [],
    lastDist: null, lastMid: null,
    rafId: null,
    startX: 0, startY: 0, moved: false,
  });
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [dragClose, setDragClose] = useState(0);
  const CLOSE_THRESHOLD = 110;

  function applyTransform(s) { setTransform({ scale: s.scale, tx: s.tx, ty: s.ty }); }

  function clamp(s) {
    const minScale = 1, maxScale = 6;
    s.scale = Math.min(maxScale, Math.max(minScale, s.scale));
    if (s.scale <= 1) { s.tx = 0; s.ty = 0; }
  }

  function startInertia() {
    const s = stateRef.current;
    if (s.rafId) cancelAnimationFrame(s.rafId);
    function tick() {
      if (Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1) { s.rafId = null; return; }
      s.tx += s.vx; s.ty += s.vy;
      s.vx *= 0.92; s.vy *= 0.92;
      clamp(s); applyTransform(s);
      s.rafId = requestAnimationFrame(tick);
    }
    s.rafId = requestAnimationFrame(tick);
  }

  function onPointerDown(e) {
    const s = stateRef.current;
    if (s.rafId) { cancelAnimationFrame(s.rafId); s.rafId = null; }
    s.pointers = [...s.pointers.filter((p) => p.id !== e.pointerId), { id: e.pointerId, x: e.clientX, y: e.clientY }];
    if (s.pointers.length === 1) {
      s.lastMid = { x: e.clientX, y: e.clientY }; s.lastDist = null;
      s.startX = e.clientX; s.startY = e.clientY; s.moved = false;
    }
    if (s.pointers.length === 2) {
      const [a, b] = s.pointers;
      s.lastDist = Math.hypot(b.x - a.x, b.y - a.y);
      s.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    s.vx = 0; s.vy = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  function onPointerMove(e) {
    const s = stateRef.current;
    const idx = s.pointers.findIndex((p) => p.id === e.pointerId);
    if (idx === -1) return;
    const prev = s.pointers[idx];
    s.pointers[idx] = { id: e.pointerId, x: e.clientX, y: e.clientY };

    if (s.pointers.length === 1) {
      if (s.scale <= 1) {
        const totalX = e.clientX - s.startX;
        const totalY = e.clientY - s.startY;
        if (Math.abs(totalX) > 8 || Math.abs(totalY) > 8) s.moved = true;
        if (totalY > 0 && totalY > Math.abs(totalX)) setDragClose(totalY);
        else setDragClose(0);
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      s.tx += dx; s.ty += dy;
      s.vx = dx; s.vy = dy;
      s.moved = true;
      clamp(s); applyTransform(s);
    } else if (s.pointers.length === 2) {
      s.moved = true;
      const [a, b] = s.pointers;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (s.lastDist) {
        const ratio = dist / s.lastDist;
        s.scale *= ratio;
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = mid.x - (rect?.left ?? 0) - (rect?.width ?? 0) / 2;
        const cy = mid.y - (rect?.top ?? 0) - (rect?.height ?? 0) / 2;
        s.tx = cx + (s.tx - cx) * ratio + (mid.x - s.lastMid.x);
        s.ty = cy + (s.ty - cy) * ratio + (mid.y - s.lastMid.y);
      }
      s.lastDist = dist; s.lastMid = mid;
      clamp(s); applyTransform(s);
    }
  }

  function onPointerUp(e) {
    const s = stateRef.current;
    s.pointers = s.pointers.filter((p) => p.id !== e.pointerId);
    if (s.pointers.length === 0) {
      if (s.scale <= 1) {
        if (dragClose > CLOSE_THRESHOLD) { onClose(); return; }
        setDragClose(0);
        s.tx = 0; s.ty = 0; applyTransform(s);
      } else {
        startInertia();
      }
      s.lastDist = null;
    }
  }

  const lastTapRef = useRef(0);
  function onTap(e) {
    const s = stateRef.current;
    if (s.moved) return;
    const now = Date.now();
    const isDouble = now - lastTapRef.current < 260;
    lastTapRef.current = now;
    if (isDouble) {
      if (s.scale > 1.5) { s.scale = 1; s.tx = 0; s.ty = 0; }
      else {
        const rect = containerRef.current?.getBoundingClientRect();
        s.scale = 3;
        s.tx = -((e.clientX - (rect?.left ?? 0)) - (rect?.width ?? 0) / 2) * 2;
        s.ty = -((e.clientY - (rect?.top ?? 0)) - (rect?.height ?? 0) / 2) * 2;
        clamp(s);
      }
      applyTransform(s);
      return;
    }
    if (s.scale <= 1) {
      const r = imgRef.current?.getBoundingClientRect();
      const onImg = r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!onImg) onClose();
    }
  }

  useEffect(() => () => { if (stateRef.current.rafId) cancelAnimationFrame(stateRef.current.rafId); }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{
        backgroundColor: `rgba(0,0,0,${Math.max(0.4, 0.95 - dragClose / 320)})`,
        transition: dragClose === 0 ? 'background-color 0.3s ease' : 'none',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onTap}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
            transform: `translate(${transform.tx}px, ${transform.ty + (transform.scale <= 1 ? dragClose : 0)}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
            userSelect: 'none', pointerEvents: 'none',
            transition: stateRef.current.pointers.length === 0 && transform.scale <= 1 ? 'transform 0.3s ease' : 'none',
          }}
        />
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
        style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}
