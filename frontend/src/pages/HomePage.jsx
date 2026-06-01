import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import HeroCarousel from '../components/HeroCarousel.jsx';
import WheelHomeSection from '../components/WheelHomeSection.jsx';
import ShutTheBoxHomeSection from '../components/ShutTheBoxHomeSection.jsx';
import Confetti from '../components/Confetti.jsx';
import AudioNotesSection from '../components/AudioNotesSection.jsx';
import CalendarUpcomingSection from '../components/CalendarUpcomingSection.jsx';
import StoriesStrip from '../components/stories/StoriesStrip.jsx';
import { daysUntil } from '../lib/countdown.js';

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
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    api.listProducts().then(setProducts).catch((e) => setError(e.message));
    api.listHeroSlides('top').then(setTopSlides).catch(console.error);
    api.listHeroSlides('games').then(setGameSlides).catch(console.error);
  }, []);

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
      {daysUntil(settings.banner_countdown_date) === 0 && <Confetti />}

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

      <HeroCarousel slides={topSlides} />

      {/*
        \u2500\u2500 Responsive two-column section \u2500\u2500
        Mobile  : flex-col \u2192 sidebar stacks first (Calendar\u2192Games\u2192Wheel\u2192STB),
                  then products \u2014 preserving the exact current iPhone order.
        Tablet+ : CSS grid \u2192 sidebar moves to the right column; products fill
                  the left column. No DOM order change needed; grid placement
                  handles the visual reflow via col-start / row-start.
      */}
      <div className="flex flex-col gap-5 md:grid md:grid-cols-[1fr_360px] md:items-start md:gap-6">

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
          <ShutTheBoxHomeSection />
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
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {sorted.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  className="group rounded-2xl border border-neutral-200 bg-white p-3 transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-400">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt={p.name} className="h-full w-full object-cover" />
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
