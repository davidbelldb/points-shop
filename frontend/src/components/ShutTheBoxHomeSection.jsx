import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { StbScene, StbCanvasShell } from '../pages/ShutTheBoxPage.jsx';

/**
 * Homepage embed for Shut Katie's Box.
 * Reads config from server; only renders when homepage_visible AND today is in homepage_days.
 * Renders a non-interactive preview that links to the game page.
 */
export default function ShutTheBoxHomeSection() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    api.getStbConfig().then(setConfig).catch(() => {});
  }, []);

  if (!config || !config.homepage_visible) return null;

  // Day-of-week check (client local time). 0 = Sunday, 6 = Saturday.
  const today = new Date().getDay();
  const days = Array.isArray(config.homepage_days) ? config.homepage_days : [0,1,2,3,4,5,6];
  if (days.length > 0 && !days.includes(today)) return null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
          {config.homepage_title || "Shut Katie's Box"}
        </h2>
        {config.homepage_subtitle && (
          <p className="mt-1 text-sm text-neutral-500">{config.homepage_subtitle}</p>
        )}
      </div>
      <Link to="/games/shut-the-box" className="block active:scale-[0.98] transition-transform" style={{ pointerEvents: 'auto' }}>
        <div style={{ pointerEvents: 'none' }}>
          <StbCanvasShell config={config}>
            <StbScene config={config} interactive={false} />
          </StbCanvasShell>
        </div>
      </Link>
    </div>
  );
}
