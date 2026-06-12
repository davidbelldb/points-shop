import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SWIPE_THRESHOLD = 40;     // px of horizontal travel before it counts as a swipe
const AUTO_ROTATE_MS = 4000;
const PAUSE_AFTER_INTERACT_MS = 10000; // give the user breathing room after a swipe/tap

export default function HeroCarousel({ slides }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const navigate = useNavigate();

  const dragRef = useRef(null);          // { x, y } pointer-down position
  const suppressClickRef = useRef(false); // true when the gesture was a swipe, not a tap
  const pauseTimerRef = useRef(null);

  useEffect(() => { setIndex(0); }, [slides.length]);

  // Auto-advance — runs unless paused by a recent interaction. Toggling
  // `paused` tears the interval down and (10s later) brings it back, so a
  // manual swipe never gets yanked out from under the user mid-read.
  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length, paused]);

  useEffect(() => () => clearTimeout(pauseTimerRef.current), []);

  if (!slides.length) return null;

  function pauseAutoRotate() {
    setPaused(true);
    clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_INTERACT_MS);
  }

  function go(dir) {
    setIndex((i) => (i + dir + slides.length) % slides.length);
    pauseAutoRotate();
  }

  function jumpTo(i) {
    setIndex(i);
    pauseAutoRotate();
  }

  function onPointerDown(e) {
    // Start each gesture fresh so a previous swipe (which may not emit a
    // trailing click) can never swallow the next genuine tap.
    suppressClickRef.current = false;
    dragRef.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Horizontal travel beyond the threshold (and more horizontal than
    // vertical) is a swipe — change slide and swallow the click that follows
    // so it doesn't also navigate/advance.
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      suppressClickRef.current = true;
      go(dx < 0 ? 1 : -1);
    }
  }

  function handleClick() {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    const slide = slides[index];
    const link = slide?.link_url;
    if (link) {
      if (link.startsWith('/')) navigate(link);
      else window.location.href = link;
      return;
    }
    setIndex((i) => (i + 1) % slides.length);
  }

  // Preload the current slide and its immediate neighbours so a swipe lands on
  // an already-decoded image instead of flashing in. Distant slides stay lazy.
  const isNear = (i) => {
    const d = Math.min(
      (i - index + slides.length) % slides.length,
      (index - i + slides.length) % slides.length,
    );
    return d <= 1;
  };

  return (
    <div
      className="relative aspect-[16/7] cursor-pointer touch-pan-y select-none overflow-hidden rounded-2xl bg-neutral-100"
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        >
          <img
            src={slide.image_url}
            alt={slide.title ?? ''}
            className="h-full w-full object-cover"
            draggable={false}
            loading={isNear(i) ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={i === index ? 'high' : isNear(i) ? 'auto' : 'low'}
          />
          {(slide.title || slide.code || slide.subtitle) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
              {slide.title && <p className="text-lg font-bold leading-tight">{slide.title}</p>}
              {slide.subtitle && <p className="mt-0.5 text-sm">{slide.subtitle}</p>}
              {slide.code && (
                <p className="mt-1 inline-block rounded bg-white/15 px-2 py-0.5 font-mono text-xs font-semibold backdrop-blur">
                  {slide.code}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={(e) => { e.stopPropagation(); jumpTo(i); }}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
