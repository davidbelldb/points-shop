import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';
import EntertainmentWheel, { buildEntertainmentSegments } from './EntertainmentWheel.jsx';

function toMin(s) {
  if (!s) return null;
  const [h, m] = String(s).slice(0, 5).split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Visible now? Driven by admin settings: an enable toggle, an optional set of
// days (csv: "fri,sat"), and an optional start/end time window.
function isVisibleNow(settings) {
  if (settings.entertainment_home_enabled !== 'true') return false;
  const now = new Date();
  const days = (settings.entertainment_home_days || '').split(',').map((d) => d.trim()).filter(Boolean);
  if (days.length > 0) {
    const map = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    if (!days.includes(map[now.getDay()])) return false;
  }
  const start = toMin(settings.entertainment_home_start);
  const end = toMin(settings.entertainment_home_end);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start != null && end != null) {
    if (start <= end) { if (cur < start || cur > end) return false; }
    else if (cur < start && cur > end) return false;
  } else if (start != null && cur < start) return false;
  else if (end != null && cur > end) return false;
  return true;
}

export default function EntertainmentWheelHomeSection() {
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const visible = isVisibleNow(settings);

  useEffect(() => {
    if (!visible) return;
    api.entertainmentWheel().then(setData).catch(() => setData({ titles: [] }));
  }, [visible]);

  if (!visible || !data || (data.titles ?? []).length === 0) return null;
  const segments = buildEntertainmentSegments(data.titles, data.bumShowLabel);
  const title = settings.entertainment_home_title || 'Wheel of Entertainment';
  const subtitle = settings.entertainment_home_subtitle || '';

  return (
    <div className="space-y-3 pt-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      <EntertainmentWheel segments={segments} />
    </div>
  );
}
