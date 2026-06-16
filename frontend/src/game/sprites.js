/**
 * Sneakyscapes sprite registry & variant resolver.
 * ------------------------------------------------------------------
 * Auto-discovers every image under  src/assets/sprites/**  at build time via
 * Vite's import.meta.glob. To add art you just DROP A FILE into the right
 * folder and rebuild — no manifest to edit, and Vite content-hashes the URL so
 * caches bust automatically.
 *
 * Folder convention (one folder per thing, many state files inside):
 *
 *   src/assets/sprites/
 *     base/
 *       default.png            ← the ground tile under everything
 *       winter.png  snow.png   ← optional ground variants by scene
 *     shed/
 *       default.png            ← fallback if no state matches
 *       night.png  winter.png  snow.png  on.png ...
 *     hydrangea/
 *       default.png  bloom.png  bare.png  winter.png ...
 *     <itemKey>/<stateName>.png|webp|jpg
 *
 * State file NAMES are matched by the variant resolver below. A file can encode
 * a single token (e.g. "winter.png", "night.png", "snow.png", "on.png") or a
 * combination joined by "-" (e.g. "winter-snow.png", "winter-night.png"). The
 * resolver tries the most specific combination first, then single tokens, then
 * "default", then falls back to the flat colour block. So you only ever make the
 * art you actually want — everything else degrades gracefully.
 *
 * This registry is renderer-agnostic: today the DOM renderer uses the URLs as
 * CSS background-images; when we move to PixiJS the exact same URLs feed
 * PIXI.Assets / Texture.from with zero data changes.
 */

// Eager import → { '../assets/sprites/sneakyscapes/shed/default.png': '/assets/shed.123.png', ... }
// Namespaced under sneakyscapes/ so it never collides with other games' art.
const modules = import.meta.glob('../assets/sprites/sneakyscapes/**/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

// Registry keyed "<folder>/<stateName>" (lowercased), e.g. "shed/winter".
export const SPRITE_REGISTRY = {};
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/sprites\/sneakyscapes\/(.+)\.[a-z0-9]+$/i);
  if (m) SPRITE_REGISTRY[m[1].toLowerCase()] = url;
}

/**
 * Ordered list of candidate state names for the current scene + item state,
 * most-specific first. `env` is the global scene; `inst` is the placed item.
 *   env  = { season, weather, timeOfDay }
 *   inst = { growth?, watered?, device? }
 */
export function variantCandidates(env = {}, inst = {}) {
  const tokens = [];
  if (inst.growth) tokens.push(inst.growth); // 'bare' | 'bloom' | 'sprout' | ...
  if (inst.device && inst.device.state) tokens.push(inst.device.state); // 'on' | 'off'
  if (inst.watered === false) tokens.push('dry');
  if (env.weather && env.weather !== 'clear') tokens.push(env.weather); // 'rain' | 'snow'
  if (env.season) tokens.push(env.season); // 'spring' | 'summer' | 'autumn' | 'winter'
  if (env.timeOfDay === 'night') tokens.push('night');

  const candidates = [];
  if (tokens.length) candidates.push(tokens.join('-')); // full combination
  tokens.forEach((t) => candidates.push(t)); // each single token, in priority order
  candidates.push('default');
  return candidates;
}

/** Resolve the best sprite URL for an item in a given scene/state, or null. */
export function resolveItemSprite(itemKey, env, inst) {
  for (const name of variantCandidates(env, inst)) {
    const url = SPRITE_REGISTRY[`${itemKey}/${name}`.toLowerCase()];
    if (url) return url;
  }
  return null;
}

/** Ground tile sprite for the base grid (scene-aware, falls back to default). */
export function resolveBaseTile(env = {}) {
  for (const name of variantCandidates(env, {})) {
    const url = SPRITE_REGISTRY[`base/${name}`.toLowerCase()];
    if (url) return url;
  }
  return null;
}

/**
 * House overlay for the non-playable footprint — scene-aware.
 *   resolveHouseSprite('front', env) tries, in order:
 *     house/front_house_<season|weather|night>   (e.g. front_house_summer.png)
 *   then falls back to  house/front_house.png
 */
export function resolveHouseSprite(which, env = {}) {
  for (const name of variantCandidates(env, {})) {
    const key = name === 'default' ? `house/${which}_house` : `house/${which}_house_${name}`;
    const url = SPRITE_REGISTRY[key.toLowerCase()];
    if (url) return url;
  }
  return null;
}
