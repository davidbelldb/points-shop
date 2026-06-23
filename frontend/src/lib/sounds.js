// Tiny sound-effect helper. Each effect is a cached <audio> element so repeated
// plays don't re-fetch. Best-effort: autoplay can be blocked until the user has
// interacted with the page, so play() failures are swallowed.

const cache = {};

function get(src, volume) {
  let a = cache[src];
  if (!a) {
    a = new Audio(src);
    a.preload = 'auto';
    a.volume = volume;
    cache[src] = a;
  }
  return a;
}

/** Play a one-shot sound effect from /public. Restarts if already playing. */
export function playSound(src, volume = 1) {
  try {
    const a = get(src, volume);
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* ignore */ }
}

/** Crow caw — used by the scrolls (raven message) send + arrival moments. */
export function playCaw() {
  playSound('/sounds/caw.mp3', 0.9);
}
