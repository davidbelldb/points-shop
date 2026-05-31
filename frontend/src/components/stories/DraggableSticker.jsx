import { useRef } from 'react';

/* Canvas interaction wrapper for a placed sticker.
   - One finger / mouse drag → moves the sticker (position stored as x/y % of
     the stage box, clamped on-frame).
   - Two fingers → rotates (always) and, when allowScale is set, pinch-scales.
   Position, rotation and scale are reported back via onChange({ x, y, rot,
   scale }). A short tap (no real movement) calls onTap so the sticker's editor
   can open. Uses Pointer Events so it works for touch + mouse uniformly. */
export default function DraggableSticker({ sticker, stageRef, onChange, onTap, allowScale = false, children }) {
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const movedRef = useRef(false);

  function recomputeBaseline() {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        mode: 'transform',
        startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        startDist: Math.hypot(b.x - a.x, b.y - a.y),
        startRot: sticker.rot || 0,
        startScale: sticker.scale || 1,
      };
    } else if (pts.length === 1) {
      gesture.current = { mode: 'drag', lastX: pts[0].x, lastY: pts[0].y };
    } else {
      gesture.current = null;
    }
  }

  function onPointerDown(e) {
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* noop */ }
    movedRef.current = false;
    recomputeBaseline();
  }

  function onPointerMove(e) {
    if (!pointers.current.has(e.pointerId)) return;
    e.stopPropagation();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.mode === 'transform') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      movedRef.current = true;
      const patch = { rot: g.startRot + (angle - g.startAngle) * 180 / Math.PI };
      if (allowScale && g.startDist > 0) {
        patch.scale = Math.max(0.3, Math.min(4, g.startScale * (dist / g.startDist)));
      }
      onChange(patch);
      return;
    }

    // drag
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = pointers.current.get(e.pointerId);
    const dxPx = p.x - g.lastX;
    const dyPx = p.y - g.lastY;
    if (Math.abs(dxPx) > 2 || Math.abs(dyPx) > 2) movedRef.current = true;
    g.lastX = p.x; g.lastY = p.y;
    onChange({
      x: Math.max(6, Math.min(94, (sticker.x ?? 50) + (dxPx / rect.width) * 100)),
      y: Math.max(6, Math.min(94, (sticker.y ?? 50) + (dyPx / rect.height) * 100)),
    });
  }

  function endPointer(e) {
    if (pointers.current.has(e.pointerId)) {
      e.stopPropagation();
      pointers.current.delete(e.pointerId);
    }
    recomputeBaseline();
  }

  function onClick(e) {
    e.stopPropagation();
    if (movedRef.current) { movedRef.current = false; return; }
    onTap?.();
  }

  const rot = sticker.rot || 0;
  const scale = sticker.scale || 1;
  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${sticker.x ?? 50}%`,
        top: `${sticker.y ?? 50}%`,
        transform: `translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`,
        cursor: 'grab',
        width: 'max-content',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
