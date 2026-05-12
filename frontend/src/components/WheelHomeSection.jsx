import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import WheelDisplay from './WheelDisplay.jsx';

function toMin(s) {
  if (!s) return null;
  const parts = String(s).slice(0, 5).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}
function isVisibleNow(wheel) {
  if (!wheel) return false;
  const now = new Date();
  const days = wheel.homepage_days || [];
  if (days.length > 0) {
    const map = ['sun','mon','tue','wed','thu','fri','sat'];
    if (!days.includes(map[now.getDay()])) return false;
  }
  const start = toMin(wheel.homepage_start_time);
  const end   = toMin(wheel.homepage_end_time);
  const cur   = now.getHours() * 60 + now.getMinutes();
  if (start != null && end != null) {
    if (start <= end) {
      if (cur < start || cur > end) return false;
    } else {
      if (cur < start && cur > end) return false;
    }
  } else if (start != null && cur < start) return false;
  else if (end != null && cur > end) return false;
  return true;
}

export default function WheelHomeSection() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.getHomepageWheel().then(setData).catch(() => setData({ wheel: null }));
  }, []);
  if (!data?.wheel) return null;
  if (!isVisibleNow(data.wheel)) return null;
  const title    = data.wheel.homepage_title    || data.wheel.name || 'Wheel of Misfortune';
  const subtitle = data.wheel.homepage_subtitle || '';
  return (
    <div className="space-y-3 pt-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      <WheelDisplay wheel={data.wheel} segments={data.segments} />
    </div>
  );
}
