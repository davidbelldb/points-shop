import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { hydrateThenFetch } from '../lib/swrCache.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import HeroCarousel from '../components/HeroCarousel.jsx';
import WheelHomeSection from '../components/WheelHomeSection.jsx';
import EntertainmentWheelHomeSection from '../components/EntertainmentWheelHomeSection.jsx';
import ShutTheBox15HomeSection from '../components/ShutTheBox15HomeSection.jsx';
import SneakyButtonHomeSection from '../components/SneakyButtonHomeSection.jsx';
import Magic8BallHomeSection from '../components/Magic8BallHomeSection.jsx';
import Confetti from '../components/Confetti.jsx';
import AudioNotesSection from '../components/AudioNotesSection.jsx';
import CalendarUpcomingSection from '../components/CalendarUpcomingSection.jsx';
import StoriesStrip from '../components/stories/StoriesStrip.jsx';
import FeaturedStory from '../components/stories/FeaturedStory.jsx';
import { daysUntil, countdownClock } from '../lib/countdown.js';

// Replace the {name} token with the account's name so the admin can write e.g.
// "Welcome back {name}" and it follows a rename from Katie -> Kate automatically.
function applyNameToken(text, name) {
  if (!text) return text;
  return text.replace(/\{name\}/gi, name || 'there');
}

export default function HomePage() {
  const { settings } = useSettings();
  const { account } = useBasket();
  const [products, setProducts] = useState(null);
  const [topSlides, setTopSlides] = useState([]);
  const [gameSlides, setGameSlides] = useState([]);
  const [featuredPool, setFeaturedPool] = useState(null);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    // Repaint instantly from the last response (in-memory, or
    // sessionStorage on a fresh tab/PWA launch) while refetching in the
    // background — see swrCache.js for why this matters on the home page.
    hydrateThenFetch('home:products', setProducts, api.listProducts, (e) => setError(e.message));
    hydrateThenFetch('home:heroTop', setTopSlides, () => api.listHeroSlides('top'), console.error);
    hydrateThenFetch('home:heroGames', setGameSlides, () => api.listHeroSlides('games'), console.error);
  }, []);

  // Featured story is admin-toggled (hidden by default) and only shown on the
  // home page between 18:00 and 19:00 local time. Re-check the window every
  // minute so it appears/disappears at the boundary without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const featuredEnabled = settings.homepage_featured_enabled === 'true';
  const showFeatured = featuredEnabled && now.getHours() === 18; // 18:00–19:00

  // Only fetch the pool (this month's archived stories — same set the calendar
  // features from) once we're actually going to show it.
  useEffect(() => {
    if (!showFeatured || featuredPool !== null) return;
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    hydrateThenFetch('home:featuredPool', setFeaturedPool, () => api.listArchiveStories(from, to), console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFeatured, featuredPool]);

  const sorted = useMemo(() => {
    if (!products) return null;
    const out = [...products];
    out.sort((a, b) => {
      const ad = new Date(a.created_at).getTime();
      const bd = new Date(b.created_at).getTime();
      return sort === 'newest' ? bd - ad : ad - bd;
    });
    return out;
  }, [products, sort]);

  return (
    <div className="space-y-5">
      {daysUntil(settings.banner_countdown_date) === 0
        && countdownClock(settings.banner_countdown_date, settings.banner_countdown_time) === null
        && <Confetti />}

      {/* \u2500\u2500 Full-width top strip (unchanged on all viewports) \u2500\u2500 */}
      <AudioNotesSection />
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {applyNameToken(settings.hero_title ?? 'Welcome to Sneaky Points', account?.name)}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {applyNameToken(settings.hero_subtitle ?? 'The shop of your dreams, funded by your nightmares.', account?.name)}
        </p>
      </div>

      <StoriesStrip />

      {showFeatured && <FeaturedStory stories={featuredPool} variant="home" />}

      <HeroCarousel slides={topSlides} />

      <SneakyButtonHomeSection />

      {/*
        \u2500\u2500 Responsive two-column section \u2500\u2500
        Mobile  : flex-col \u2192 sidebar stacks first (Calendar\u2192Games\u2192Wheel\u2192STB),
                  then products \u2014 preserving the exact current iPhone order.
        Tablet+ : CSS grid \u2192 sidebar moves to the right column; products fill
                  the left column. No DOM order change needed; grid placement
                  handles the visual reflow via col-start / row-start.
      */}
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[1fr_360px] lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px] md:items-start md:gap-6 lg:gap-8">

        {/* RIGHT sidebar \u2014 Calendar, Games, Wheel, STB
            Sits first in the DOM so mobile stacking order matches current layout.
            On md+ it jumps to col 2, row 1 via explicit grid placement. */}
        <div className="space-y-5 md:col-start-2 md:row-start-1">
          <CalendarUpcomingSection />

          {gameSlides.length > 0 && (
            <div className="space-y-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
                  {settings.games_title ?? 'Games'}
                </h2>
                {settings.games_subtitle && (
                  <p className="mt-1 text-sm text-neutral-500">{settings.games_subtitle}</p>
                )}
              </div>
              <HeroCarousel slides={gameSlides} />
            </div>
          )}

          <WheelHomeSection />
          <EntertainmentWheelHomeSection />
          <ShutTheBox15HomeSection />
          <Magic8BallHomeSection />
        </div>

        {/* LEFT main column \u2014 Products
            On md+ placed in col 1, row 1 so it sits beside the sidebar.
            Products grid expands to 3 cols on wide viewports. */}
        <div className="space-y-3 md:col-start-1 md:row-start-1">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-neutral-900">Latest products</h2>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-600 focus:border-amber-500 focus:outline-none"
                aria-label="Sort products"
              >
                <option value="newest">New {'\u2192'} Old</option>
                <option value="oldest">Old {'\u2192'} New</option>
              </select>
            </div>
            <p className="mt-1 text-sm text-neutral-500">The best products for the shittiest behavior.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {!sorted && !error && <p className="text-sm text-neutral-500">Loading...</p>}
          {sorted && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {sorted.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  className="group rounded-2xl border border-neutral-200 bg-white p-3 md:p-4 transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-400">
                    {p.thumbnail_url ? (
                      <img
                        src={p.thumbnail_url}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                    )}
                  </div>
                  <h3 className="mt-2 line-clamp-1 text-sm font-medium">{p.name}</h3>
                  <p className="text-sm font-semibold text-amber-700">{p.price_points} pts</p>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
