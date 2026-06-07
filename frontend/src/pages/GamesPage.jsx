import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import titleScreenUrl from '../assets/backgrounds/title_screen.png';

// Mirror the card style from StackedCards so CMS + hardcoded cards sit in
// the same grid without any component nesting.
function CmsCard({ slide }) {
  const inner = (
    <div className="relative aspect-[16/7] md:aspect-square lg:aspect-[4/3] overflow-hidden rounded-2xl bg-neutral-100 shadow-sm">
      <img src={slide.image_url} alt={slide.title ?? ''} className="h-full w-full object-cover" />
      {(slide.title || slide.code || slide.subtitle) && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          {slide.title    && <p className="text-lg font-bold leading-tight">{slide.title}</p>}
          {slide.subtitle && <p className="mt-0.5 text-sm">{slide.subtitle}</p>}
          {slide.code     && (
            <p className="mt-1 inline-block rounded bg-white/15 px-2 py-0.5 font-mono text-xs font-semibold backdrop-blur">
              {slide.code}
            </p>
          )}
        </div>
      )}
    </div>
  );
  if (slide.link_url) {
    if (slide.link_url.startsWith('/')) return <Link to={slide.link_url} className="block">{inner}</Link>;
    return <a href={slide.link_url} className="block">{inner}</a>;
  }
  return inner;
}

function StreetsCambsRageCard() {
  return (
    <Link to="/games/streets-of-cambs-rage" className="block group">
      <div className="relative aspect-[16/7] md:aspect-square lg:aspect-[4/3] overflow-hidden rounded-2xl shadow-sm">
        <img
          src={titleScreenUrl}
          alt="Streets of Cambs-Rage"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="font-bold leading-tight text-white"
             style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '0.65rem', letterSpacing: '0.04em' }}>
            Streets of Cambs-Rage
          </p>
          <p className="mt-1.5 text-xs text-white/70">Beat 'em up · 1 Player</p>
        </div>
        <div className="absolute top-3 right-3 rounded px-2 py-0.5 text-white font-bold tracking-widest"
             style={{ background: '#ef4444', fontFamily: 'system-ui, sans-serif', fontSize: '0.6rem' }}>
          NEW
        </div>
      </div>
    </Link>
  );
}

export default function GamesPage() {
  const { settings } = useSettings();
  const [slides, setSlides] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listHeroSlides('games')
      .then(setSlides)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">{settings.games_title ?? 'Games'}</h1>
        <span className="w-12" />
      </div>
      {settings.games_subtitle && (
        <p className="text-center text-sm text-neutral-500">{settings.games_subtitle}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <StreetsCambsRageCard />
        {slides && slides.map((s) => <CmsCard key={s.id} slide={s} />)}
      </div>

      {slides === null && !error && (
        <p className="text-sm text-neutral-500">Loading...</p>
      )}
    </div>
  );
}
