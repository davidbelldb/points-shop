/*
 * Feature access by audience — default DENY.
 *
 * Tagging features one at a time is default-allow: every new endpoint is
 * reachable by a child's account until somebody remembers to gate it. This
 * inverts that. A kids account can only reach features explicitly switched on
 * in `feature_access`; anything unmapped or unlisted 404s.
 *
 * This is the FEATURE layer — "can you reach Truth or Dare at all". Which rows
 * you see inside a feature you can reach (products, reels, hero slides) is the
 * separate item-level `audience` column on those tables.
 */
import { query } from './db.js';

/* Always reachable, whoever you are: auth, your own account, the app's own
   config and the plumbing behind uploads and notifications. */
const CORE_PREFIXES = [
  '/api/auth',
  '/api/account',
  '/api/settings',
  '/api/features',
  '/api/friends',
  '/api/bootstrap',
  '/api/upload',
  '/api/notifications',
];

/* Route prefix → feature. Longest match wins, so '/api/games/ducky' beats
   '/api/games'. Anything not listed here is denied to kids by design. */
export const FEATURE_ROUTES = {
  shop: ['/api/products', '/api/basket', '/api/orders', '/api/delivery-options', '/api/shopping'],
  ducky_derby: ['/api/games/ducky'],
  shut_the_box: ['/api/games/shut-the-box-15'],
  messaging: ['/api/messages'],
  scrolls: ['/api/scrolls'],

  stories: ['/api/stories', '/api/reels', '/api/moments'],
  truth_or_dare: ['/api/games/truth-or-dare'],
  dirty_wordle: ['/api/games/dirty-wordle'],
  other_games: [
    '/api/games/cambs-rage', '/api/games/giftsweeper', '/api/games/just-say-the-word',
    '/api/games/plinko', '/api/games/tic-tac-face', '/api/games/players',
    '/api/wheels', '/api/entertainment',
  ],
  crossword: ['/api/crossword'],
  calendar: ['/api/calendar'],
  notes: ['/api/notes'],
  audio_notes: ['/api/audio-notes'],
  timeline: ['/api/timeline'],
  watch_list: ['/api/rewatch', '/api/reads'],
  playlist: ['/api/playlist', '/api/lastfm'],
  reviews: ['/api/reviews'],
  surveys: ['/api/surveys'],
  spreadsheets: ['/api/spreadsheets'],
  on_my_way: ['/api/omw', '/api/footprints'],
  calls: ['/api/calls', '/api/rtc'],
  nfc: ['/api/nfc'],
  sneakyscapes: ['/api/sneakyscapes'],
  sneaky_button: ['/api/sneaky-button'],
  hero: ['/api/hero-slides'],
  widgets: ['/api/widget'],
};

/* Everything a kids account may reach. Anything absent is invisible — including
   features that don't exist yet, which is the point. */
export const KIDS_DEFAULT = ['shop', 'ducky_derby', 'shut_the_box', 'messaging', 'scrolls'];

export const ALL_FEATURES = Object.keys(FEATURE_ROUTES);

function isCore(path) {
  return CORE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Which feature a path belongs to, by longest matching prefix. */
export function featureForPath(path) {
  let best = null;
  let bestLength = 0;
  for (const [feature, prefixes] of Object.entries(FEATURE_ROUTES)) {
    for (const prefix of prefixes) {
      if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
        best = feature;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

/* The table is tiny and read on every request, so it's cached briefly rather
   than queried each time. An admin toggle clears it immediately. */
let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

export function clearFeatureCache() {
  cache = null;
}

async function loadAccess() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const { rows } = await query(`SELECT feature, audience, enabled FROM feature_access`);
  const map = new Map();
  for (const r of rows) map.set(`${r.audience}:${r.feature}`, r.enabled);
  cache = map;
  cachedAt = Date.now();
  return cache;
}

export async function isFeatureEnabled(feature, audience) {
  if (!feature) return false;
  const access = await loadAccess();
  const value = access.get(`${audience}:${feature}`);
  // Unknown combinations are denied for kids and allowed for adults — the table
  // is the allow-list for children, not a blocklist for grown-ups.
  if (value === undefined) return audience !== 'kids';
  return value;
}

export async function enabledFeaturesFor(audience) {
  const access = await loadAccess();
  return ALL_FEATURES.filter((f) => {
    const value = access.get(`${audience}:${f}`);
    return value === undefined ? audience !== 'kids' : value;
  });
}

/**
 * The guard itself. Adults are unrestricted; a kids account may only reach
 * core paths and features switched on for it. Admin routes are left to the
 * existing role check.
 */
export async function assertFeatureAllowed(req, reply) {
  const path = req.url.split('?')[0];
  if (!path.startsWith('/api/')) return true;
  if (isCore(path) || path === '/api/admin' || path.startsWith('/api/admin/')) return true;

  const audience = req.user?.audience === 'kids' ? 'kids' : 'adult';
  if (audience !== 'kids') return true;

  const feature = featureForPath(path);
  if (await isFeatureEnabled(feature, 'kids')) return true;

  // 404 rather than 403: a feature they can't have shouldn't announce itself.
  reply.code(404).send({ error: 'Not found' });
  return false;
}
