import { useMemo } from 'react';

/* A celebratory confetti shower over the whole page — falls once, then settles
   off-screen. Pointer-events-none, so it never blocks interaction. */
export default function Confetti() {
  const pieces = useMemo(() => {
    const cols = ['#ffd23f', '#ff5d8f', '#4aa3c7', '#5bbf3a', '#ff8c42', '#a878ff'];
    return Array.from({ length: 90 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      col: cols[i % cols.length],
      delay: Math.random() * 2.5,
      dur: 3 + Math.random() * 3,
      size: 7 + Math.random() * 7,
      drift: (Math.random() - 0.5) * 140,
    }));
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      <style>{`@keyframes ddpageconf{0%{transform:translate(0,-12vh) rotate(0);opacity:1}100%{transform:translate(var(--dx),106vh) rotate(720deg);opacity:1}}`}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size * 0.55,
            background: p.col,
            borderRadius: 1,
            ['--dx']: `${p.drift}px`,
            animation: `ddpageconf ${p.dur}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
