import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import WheelDisplay from './WheelDisplay.jsx';

export default function WheelHomeSection() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.getHomepageWheel().then(setData).catch(() => setData({ visible: false }));
  }, []);
  if (!data?.visible || !data.wheel) return null;
  const title = data.wheel.homepage_title || data.wheel.name || 'Wheel of Misfortune';
  return (
    <div className="space-y-3 pt-2">
      <h2 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h2>
      <WheelDisplay wheel={data.wheel} segments={data.segments} />
    </div>
  );
}
