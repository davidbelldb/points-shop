import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ShutTheBox15Game } from '../pages/ShutTheBox15Page.jsx';

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
      <ShutTheBox15Game showStatus={false} />
    </div>
  );
}
