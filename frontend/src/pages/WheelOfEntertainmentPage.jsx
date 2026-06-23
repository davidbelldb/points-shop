import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import EntertainmentWheel, { buildEntertainmentSegments } from '../components/EntertainmentWheel.jsx';

export default function WheelOfEntertainmentPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.entertainmentWheel().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/games" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="flex min-h-[40vh] items-center justify-center text-sm text-neutral-500">Loading...</div>;

  const segments = buildEntertainmentSegments(data.titles, data.bumShowLabel);
  // segments always includes Bum Show, so < 2 means no real titles.
  const hasTitles = (data.titles ?? []).length > 0;

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between">
        <Link to="/games" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Wheel of Entertainment</h1>
        <span className="w-10" />
      </div>
      {!hasTitles ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-500">Nothing to watch yet.</p>
          <p className="mt-1 text-xs text-neutral-400">Mark watchlist titles as &ldquo;invite&rdquo; or add some in the admin page.</p>
        </div>
      ) : (
        <EntertainmentWheel segments={segments} />
      )}
    </div>
  );
}
