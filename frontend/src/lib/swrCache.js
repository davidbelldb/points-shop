/**
 * Tiny stale-while-revalidate cache for read-only home-page data
 * (products, hero slides, stories/reels/archive).
 *
 * Why this exists: HomePage and StoriesStrip fetch their data in a plain
 * `useEffect(() => { ... }, [])` with state initialised to `null`/`[]`.
 * React Router unmounts these components when you navigate to /games (or
 * anywhere else) and remounts them on the way back to "/" — so every
 * return trip to the home page reset all that state and re-ran every
 * fetch from scratch, showing "Loading..." and empty story rings again
 * even though nothing had changed.
 *
 * `hydrateThenFetch` lets a component synchronously paint the last known
 * good response (from memory, or sessionStorage if this is a fresh tab/
 * PWA launch) on mount, then fetches in the background and updates both
 * the cache and the component once the network responds. So a return to
 * "/" repaints instantly with the previous data and quietly refreshes it
 * — nothing ever shows as more than one round-trip stale.
 */

const mem = new Map();
const PREFIX = 'sp:cache:';

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeSession(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded cases —
    // the in-memory cache still works for the rest of this tab's lifetime.
  }
}

export function getCached(key) {
  if (mem.has(key)) return mem.get(key);
  const fromSession = readSession(key);
  if (fromSession !== undefined) mem.set(key, fromSession);
  return fromSession;
}

export function setCached(key, value) {
  mem.set(key, value);
  writeSession(key, value);
}

/**
 * Paint `key`'s cached value (if any) via `setter`, then call `fetcher()`
 * and paint + cache the fresh result. `onError` (optional) only fires for
 * the network call — a cache hit never triggers it.
 */
export function hydrateThenFetch(key, setter, fetcher, onError) {
  const cached = getCached(key);
  if (cached !== undefined) setter(cached);
  fetcher()
    .then((data) => {
      setCached(key, data);
      setter(data);
    })
    .catch((e) => onError?.(e));
}
