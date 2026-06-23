import { lazy, Suspense } from 'react';
import { useSettings } from '../lib/SettingsContext.jsx';

// Lazy-load the 3D Magic 8-Ball (three.js) — same pattern as
// ShutTheBox15HomeSection, so the engine chunk only downloads when this
// section actually renders.
const Magic8BallGame = lazy(() =>
  import('../pages/Magic8BallPage.jsx').then((m) => ({ default: m.Magic8BallGame })),
);

const GameSkeleton = () => (
  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-600">
    Loading Magic 8-Ball…
  </div>
);

/**
 * Homepage embed for the Magic 8-Ball — pick "Movies & TV" or "Video Games"
 * and shake the ball (drag, scrub, or physically shake your phone) for a
 * pick from the watchlist / playlist.
 */
export default function Magic8BallHomeSection() {
  const { settings } = useSettings();
  if (settings.magic8ball_homepage_visible !== 'true') return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
          Magic 8-Ball
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Stuck for what to watch or play? Ask the ball.
        </p>
      </div>
      <Suspense fallback={<GameSkeleton />}>
        <Magic8BallGame />
      </Suspense>
    </div>
  );
}
