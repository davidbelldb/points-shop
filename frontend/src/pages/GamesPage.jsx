import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import StackedCards from '../components/StackedCards.jsx';

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
      {slides === null && !error && <p className="text-sm text-neutral-500">Loading...</p>}
      {slides && slides.length === 0 && (
        <p className="text-sm text-neutral-500">No games configured yet.</p>
      )}
      {slides && slides.length > 0 && <StackedCards slides={slides} />}
    </div>
  );
}
