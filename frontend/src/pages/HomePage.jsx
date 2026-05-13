import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import HeroCarousel from '../components/HeroCarousel.jsx';
import WheelHomeSection from '../components/WheelHomeSection.jsx';
import ShutTheBoxHomeSection from '../components/ShutTheBoxHomeSection.jsx';

export default function HomePage() {
  const { settings } = useSettings();
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
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          {settings.hero_title ?? 'Welcome to Sneaky Points'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {settings.hero_subtitle ?? 'The shop of your dreams, funded by your nightmares.'}
        </p>
      </div>

      <HeroCarousel slides={topSlides} />

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
        <div className="grid grid-cols-2 gap-3">
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
  );
}
