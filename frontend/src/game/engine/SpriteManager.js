/**
 * SpriteManager
 *
 * Loads and caches HTMLImageElements.
 * Accepts a URL map produced by Vite's asset imports (hashed URLs, CDN-ready).
 *
 * Usage:
 *   const mgr = new SpriteManager();
 *   await mgr.preload({ katie_idle: idleUrl, katie_walk_01: walk01Url, ... });
 *   const img = mgr.get('katie_idle');  // HTMLImageElement or null
 */
export class SpriteManager {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} */
    this._cache = new Map();
  }

  /**
   * Preload all sprites in the manifest and cache them.
   * Returns a promise that resolves once every image has loaded (or failed).
   * Failed images are skipped silently so a missing asset doesn't crash the game.
   *
   * @param {Record<string, string>} urlMap  e.g. { katie_idle: '/assets/katie_idle-abc123.png' }
   * @returns {Promise<void>}
   */
  preload(urlMap) {
    const promises = Object.entries(urlMap).map(([name, url]) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload  = () => { this._cache.set(name, img); resolve(); };
        img.onerror = () => { console.warn(`SpriteManager: failed to load "${name}" from ${url}`); resolve(); };
        img.src = url;
      })
    );
    return Promise.all(promises).then(() => undefined);
  }

  /**
   * @param {string} name
   * @returns {HTMLImageElement | null}
   */
  get(name) {
    return this._cache.get(name) ?? null;
  }

  /** True only if every key in the given map has been loaded. */
  isReady(urlMap) {
    return Object.keys(urlMap).every((k) => this._cache.has(k));
  }
}
