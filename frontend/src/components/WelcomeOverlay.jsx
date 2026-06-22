import { useEffect, useState } from 'react';
import { useBasket } from '../lib/BasketContext.jsx';

// One-time welcome that continues the launch splash: same plum (#a04d89) fill,
// with a big blocky "Welcome back, {name}!" that animates in then fades away.
// Shows exactly once per install (localStorage flag), then never again.
const SEEN_KEY = 'sneaky:welcomed:v1';

export default function WelcomeOverlay() {
  const { account } = useBasket();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const name = account?.name;
    if (!name) return undefined;
    let seen = true;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { seen = false; }
    if (seen) return undefined;
    setShow(true);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
    const t1 = setTimeout(() => setLeaving(true), 2400);
    const t2 = setTimeout(() => setShow(false), 3050);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [account?.name]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-8 text-center"
      style={{
        background: '#a04d89',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.6s ease',
        pointerEvents: leaving ? 'none' : 'auto',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <style>{`
        @keyframes sneakyWelcomeIn {
          0%   { opacity: 0; transform: translateY(28px) scale(0.82); }
          60%  { opacity: 1; transform: translateY(-6px) scale(1.05); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <p
        className="text-lg font-semibold uppercase tracking-[0.2em] text-white/75"
        style={{ animation: 'sneakyWelcomeIn 0.5s ease-out both' }}
      >
        Welcome back,
      </p>
      <h1
        className="mt-2 font-black leading-none text-white"
        style={{
          fontSize: 'clamp(3rem, 17vw, 6.5rem)',
          letterSpacing: '-0.03em',
          textShadow: '0 5px 0 rgba(0,0,0,0.18), 0 10px 24px rgba(0,0,0,0.25)',
          animation: 'sneakyWelcomeIn 0.65s 0.15s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        {account.name}!
      </h1>
    </div>
  );
}
