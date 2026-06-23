import { useEffect, useState, lazy, Suspense } from 'react';
import { api } from '../lib/api.js';

// Lazy-load the 3D game (three.js + rapier physics). Importing it statically
// pulled the entire 3D engine into the main bundle via HomePage, bloating the
// initial chunk to ~3.7MB and making cold loads take 5-8s on phones. As a
// dynamic import it gets its own chunk that's only fetched when this section
// actually renders the board — which, thanks to the visibility/day gating
// below, means three/rapier never even download on days the game is hidden.
// React.lazy needs a default export; ShutTheBox15Game is a named export, so
// remap it here.
const ShutTheBox15Game = lazy(() =>
  import('../pages/ShutTheBox15Page.jsx').then((m) => ({ default: m.ShutTheBox15Game })),
);

// Skeleton shown while the game chunk downloads — sized to roughly match the
// board so the home page doesn't jump when it swaps in.
const GameSkeleton = () => (
  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600">
    Loading game…
  </div>
);

/**
 * Homepage embed for Shut the Box 15 — fully playable.
 * Hidden unless homepage_visible AND today is in homepage_days.
 */
export default function ShutTheBox15HomeSection() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.getStb15Config().then(setConfig).catch(() => {});
  }, []);

  if (!config || !config.homepage_visible) return null;

  const today = new Date().getDay();
  const days = Array.isArray(config.homepage_days) ? config.homepage_days : [0, 1, 2, 3, 4, 5, 6];
  if (days.length > 0 && !days.includes(today)) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
          {config.homepage_title || 'Shut the Box — 15'}
        </h2>
        {config.homepage_subtitle && (
          <p className="mt-1 text-sm text-neutral-500">{config.homepage_subtitle}</p>
        )}
      </div>
      <Suspense fallback={<GameSkeleton />}>
        <ShutTheBox15Game showStatus={false} />
      </Suspense>
    </div>
  );
}
