import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* Side-scroller camera: course is COURSE_LEN screen-widths long; camera follows the leader. */
const COURSE_LEN = 2.5;
const ANCHOR = 0.4;
const END_X = 0.68;
const SPREAD = 235;
const START_WX = 0.26;      // start line sits a little ahead of the ducks
const DUCK_W = 70;
const DUCK_H = 60;
const LANE_GAP = 15;
const GRASS_TOP = 58;       // ~30% taller — room for pole banners
const MUD_H = 12;
const WATER_TOP = GRASS_TOP + MUD_H;
const TOP_OVERLAP = 16;     // top duck pokes up over the far bank
const GRASS_BOTTOM = 22;    // near bank — sits IN FRONT of the ducks
const BOTTOM_TUCK = 12;     // last duck tucks behind the near bank

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function oddsLabel(num, den) { return `${num}/${den}`; }
function oddsMult(num, den) { return num / den + 1; }

function shade(hex, amt) {
  const h = (hex || '#4aa3c7').replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) + amt;
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  });
  return `#${ch.join('')}`;
}
function waveBg(col) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='30'><path d='M0 18 Q45 5 90 18 T180 18 V30 H0 Z' fill='${col}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// Cartoon grass: a repeating band of spiky blades, anchored at the bottom of the tile.
function grassBg(col) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='22'>` +
    `<path d='M0 22 H96 V12 L88 1 L80 12 L72 3 L64 12 L56 2 L48 12 L40 4 L32 12 L24 1 L16 12 L8 3 L0 12 Z' fill='${col}'/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function DuckSprite({ ord, duckColour, billColour, w, h }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="relative" style={{ width: w, height: h }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: w * 0.82, height: w * 0.62, background: duckColour }}>
          <span className="absolute" style={{ right: -w * 0.13, top: '42%', width: w * 0.26, height: w * 0.16, background: billColour, borderRadius: '0 50% 50% 0' }} />
        </div>
      </div>
    );
  }
  return <img src={`/duck_${ord}.png?v=2`} alt="" style={{ width: w, height: h, objectFit: 'contain', display: 'block' }} onError={() => setBroken(true)} />;
}

/* A cartoon banner held up by two black poles. The poles sit at zIndex 6 — behind
   the grass tuft fringe (zIndex 7) — so their bases tuck into the grass. The cloth
   sits at zIndex 8, on top of the grass. */
function PoleBanner({ text }) {
  return (
    <div className="relative">
      <div className="absolute" style={{ left: 4, top: 5, width: 5, height: 44, background: '#1a1a1a', borderRadius: 2, zIndex: 6 }} />
      <div className="absolute" style={{ right: 4, top: 5, width: 5, height: 44, background: '#1a1a1a', borderRadius: 2, zIndex: 6 }} />
      <div className="relative whitespace-nowrap rounded-md bg-white px-3 py-1 text-center text-[11px] font-extrabold uppercase text-black shadow-md"
        style={{ border: '2px solid #1a1a1a', zIndex: 8 }}>
        {text}
      </div>
    </div>
  );
}

/* A burst of falling confetti — pure CSS, clipped by the track's overflow-hidden. */
function Confetti() {
  const pieces = useMemo(() => {
    const cols = ['#ffd23f', '#ff5d8f', '#4aa3c7', '#5bbf3a', '#ff8c42', '#a878ff', '#ffffff'];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      col: cols[i % cols.length],
      delay: Math.random() * 1.2,
      dur: 1.9 + Math.random() * 1.8,
      size: 6 + Math.random() * 6,
      drift: (Math.random() - 0.5) * 90,
    }));
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 35 }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute"
          style={{
            left: `${p.left}%`, top: -24, width: p.size, height: p.size * 0.55,
            background: p.col, borderRadius: 1,
            animation: `ddconfetti ${p.dur}s linear ${p.delay}s infinite`,
            ['--drift']: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

function duckState(elapsed, finishMs, whirlpools) {
  const list = whirlpools || [];
  const whirlTotal = list.reduce((s, w) => s + w.durationMs, 0);
  const movingMs = Math.max(1, finishMs - whirlTotal);
  let rem = elapsed;
  let lastAt = 0;
  for (const wp of list) {
    const segMs = (wp.at - lastAt) * movingMs;
    if (rem < segMs) return { m: lastAt + rem / movingMs, whirl: null };
    rem -= segMs;
    if (rem < wp.durationMs) return { m: wp.at, whirl: { frac: rem / wp.durationMs, loops: wp.loops } };
    rem -= wp.durationMs;
    lastAt = wp.at;
  }
  return { m: Math.min(1, lastAt + rem / movingMs), whirl: null };
}

/* Inverse of duckState: the elapsed ms at which a duck first reaches progress targetM. */
function progressToTime(targetM, finishMs, whirlpools) {
  const list = whirlpools || [];
  const whirlTotal = list.reduce((s, w) => s + w.durationMs, 0);
  const movingMs = Math.max(1, finishMs - whirlTotal);
  let t = 0;
  let lastAt = 0;
  for (const wp of list) {
    if (targetM <= wp.at) return t + (targetM - lastAt) * movingMs;
    t += (wp.at - lastAt) * movingMs + wp.durationMs;
    lastAt = wp.at;
  }
  return t + (targetM - lastAt) * movingMs;
}

export default function DuckyDerbyPage() {
  const { refresh: refreshBasket } = useBasket();
  const [phase, setPhase] = useState('loading');
  const [config, setConfig] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [balance, setBalance] = useState(0);
  const [pickedOrd, setPickedOrd] = useState(null);
  const [stake, setStake] = useState('');
  const [result, setResult] = useState(null);
  const [bubbles, setBubbles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [countText, setCountText] = useState('3');
  const [confetti, setConfetti] = useState(false);
  const [commentary, setCommentary] = useState([{ id: 0, text: 'Pick a duck and place your bet!' }]);

  const laneRefs = useRef({});
  const spriteRefs = useRef({});
  const bannerRefs = useRef({});
  const finishRef = useRef(null);
  const startRef = useRef(null);
  const resultTimer = useRef(null);
  const sinkRef = useRef(null);
  const commentaryId = useRef(0);

  async function newLineup() {
    setBusy(true); setError(null);
    try {
      const [cfg, lu] = await Promise.all([
        config ? Promise.resolve(config) : api.duckyConfig(),
        api.duckyLineup(),
      ]);
      if (!config) setConfig(cfg);
      setLineup(lu);
      setBalance(lu.balance ?? 0);
      setPickedOrd(null);
      setStake('');
      setResult(null);
      setBubbles({});
      setConfetti(false);
      sinkRef.current = null;
      // clear any leftover sink animation from the previous race's sprites
      Object.values(spriteRefs.current).forEach((el) => {
        if (el) { el.style.opacity = '1'; el.style.transform = ''; }
      });
      commentaryId.current = 0;
      setCommentary([{ id: 0, text: 'Pick a duck and place your bet!' }]);
      setPhase('betting');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    newLineup();
    return () => { if (resultTimer.current) clearTimeout(resultTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ducks = (result?.ducks) || lineup?.ducks || [];
  const n = ducks.length || 1;
  const laneIndex = useMemo(() => {
    const map = {};
    ducks.forEach((d, i) => { map[d.ord] = i; });
    return map;
  }, [ducks]);
  const laneTop = (i) => WATER_TOP - TOP_OVERLAP + i * LANE_GAP;
  const lastDuckBottom = WATER_TOP - TOP_OVERLAP + (n - 1) * LANE_GAP + DUCK_H;
  const TRACK_H = lastDuckBottom - BOTTOM_TUCK + GRASS_BOTTOM;

  /* banners placed along the course (fresh positions each race) */
  const bannerLayout = useMemo(() => {
    const active = (config?.banners || []).filter((b) => b.active && b.text.trim());
    const k = active.length;
    return active.map((b, i) => ({
      ...b,
      wx: 0.9 + (COURSE_LEN - 1.2) * ((i + 0.4) / Math.max(1, k)) + (Math.random() - 0.5) * 0.25,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, lineup]);

  /* ---- rAF race animation ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - t0;
      const sink = result.sink;
      const states = result.ducks.map((d) => {
        const st = { d, ...duckState(elapsed, result.finish_ms[d.ord], result.whirlpools?.[d.ord]) };
        if (sink && d.ord === sink.ord && st.m > sink.at) st.m = sink.at;
        return st;
      });
      const leaderM = states.reduce((mx, s) => Math.max(mx, s.m), 0);
      const leaderWorldX = leaderM * COURSE_LEN;
      const camX = clamp(leaderWorldX - ANCHOR, 0, COURSE_LEN - END_X);
      const leaderScreen = (leaderWorldX - camX) * 100;

      for (const s of states) {
        const i = laneIndex[s.d.ord] ?? 0;
        const lane = laneRefs.current[s.d.ord];
        const sprite = spriteRefs.current[s.d.ord];
        const sinking = sink && s.d.ord === sink.ord && s.m >= sink.at;
        if (lane) {
          lane.style.left = `${leaderScreen - (leaderM - s.m) * SPREAD}%`;
          if (s.whirl && !sinking) {
            const ang = s.whirl.frac * s.whirl.loops * Math.PI * 2;
            lane.style.transform = `translate(${Math.cos(ang) * 16}px, ${Math.sin(ang) * 12}px)`;
          } else {
            lane.style.transform = 'translate(0, 0)';
          }
        }
        if (sinking) {
          if (sinkRef.current == null) sinkRef.current = elapsed;
          const sp = clamp((elapsed - sinkRef.current) / 1100, 0, 1);
          if (sprite) {
            sprite.style.transform = `translateY(${sp * 42}px) rotate(${sp * 28}deg)`;
            sprite.style.opacity = `${1 - sp}`;
          }
        } else if (sprite) {
          sprite.style.transform = `rotate(${Math.sin(elapsed / 320 + i) * 6}deg)`;
        }
      }
      if (finishRef.current) finishRef.current.style.left = `${(COURSE_LEN - camX) * 100}%`;
      if (startRef.current) startRef.current.style.left = `${(START_WX - camX) * 100}%`;
      for (const b of bannerLayout) {
        const el = bannerRefs.current[b.ord];
        if (el) el.style.left = `${(b.wx - camX) * 100}%`;
      }

      const maxMs = Math.max(...Object.entries(result.finish_ms)
        .filter(([ord]) => !sink || Number(ord) !== sink.ord)
        .map((e) => e[1]));
      if (elapsed < maxMs + 600) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, laneIndex, n, bannerLayout]);

  /* ---- speech bubbles ---- */
  const activePhrases = useMemo(
    () => (config?.phrases || []).filter((p) => p.active && p.text.trim()).map((p) => p.text),
    [config],
  );
  useEffect(() => {
    if (phase !== 'racing' || !result || activePhrases.length === 0) return;
    const timers = [];
    for (const d of result.ducks) {
      const fin = result.finish_ms[d.ord];
      const count = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const at = 1800 + Math.random() * Math.max(1000, fin - 5000);
        const text = activePhrases[Math.floor(Math.random() * activePhrases.length)];
        timers.push(setTimeout(() => setBubbles((b) => ({ ...b, [d.ord]: text })), at));
        timers.push(setTimeout(() => setBubbles((b) => { const x = { ...b }; delete x[d.ord]; return x; }), at + 2600));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, result, activePhrases]);

  /* ---- 3-2-1-GO! countdown, then the race starts ---- */
  useEffect(() => {
    if (phase !== 'countdown') return;
    const seq = ['3', '2', '1', 'GO!'];
    const timers = seq.slice(1).map((t, i) =>
      setTimeout(() => setCountText(t), (i + 1) * 800),
    );
    timers.push(setTimeout(() => setPhase('racing'), seq.length * 800));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  /* ---- race finish: confetti as the winner crosses, result modal at the end ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result) return;
    const sink = result.sink;
    const maxMs = Math.max(...Object.entries(result.finish_ms)
      .filter(([ord]) => !sink || Number(ord) !== sink.ord)
      .map((e) => e[1]));
    const winMs = result.finish_ms[result.winner_ord];
    const confettiTimer = setTimeout(() => setConfetti(true), winMs);
    resultTimer.current = setTimeout(() => {
      setPhase('result');
      if (refreshBasket) refreshBasket();
    }, maxMs + 800);
    return () => { clearTimeout(confettiTimer); clearTimeout(resultTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  /* ---- live race commentary ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result) return;
    const names = {};
    result.ducks.forEach((d) => { names[d.ord] = d.name; });
    const sink = result.sink;
    const winMs = result.finish_ms[result.winner_ord];
    const schedule = [{ t: 250, text: "And they're off!" }];

    // whirlpool callouts — a few, spread out
    const wpEvents = [];
    for (const d of result.ducks) {
      if (sink && d.ord === sink.ord) continue;
      const F = result.finish_ms[d.ord];
      const wps = result.whirlpools?.[d.ord] || [];
      for (const wp of wps) {
        const t = progressToTime(wp.at, F, wps);
        if (t > 2000 && t < winMs - 3000) wpEvents.push({ t, ord: d.ord });
      }
    }
    wpEvents.sort((a, b) => a.t - b.t);
    let lastWp = -9999;
    let wpCount = 0;
    for (const e of wpEvents) {
      if (wpCount >= 3) break;
      if (e.t - lastWp > 4000) {
        schedule.push({ t: e.t, text: `${names[e.ord]} hits the rapids!` });
        lastWp = e.t;
        wpCount += 1;
      }
    }

    // sink callout
    if (sink) {
      const st = progressToTime(sink.at, result.finish_ms[sink.ord], result.whirlpools?.[sink.ord] || []);
      schedule.push({ t: st, text: `Disaster — ${names[sink.ord]} has gone under!` });
    }

    schedule.push({ t: winMs * 0.42, text: "It's neck and neck out there!" });
    schedule.push({ t: winMs - 3400, text: 'Into the final stretch!' });
    schedule.push({ t: winMs - 150, text: `${names[result.winner_ord]} romps home to take it!` });

    // generic filler lines between the beats
    const fillers = [
      "It's a cracking pace out there!",
      '{duck} is really digging in!',
      'The crowd is on its feet!',
      '{duck} fancies this one!',
      "They're bunched up tight!",
      'What a contest, folks!',
      "{duck} won't let this slip!",
      'Pure drama on the water!',
    ];
    let fi = Math.floor(Math.random() * fillers.length);
    for (let t = 3400; t < winMs - 4200; t += 3500) {
      const rnd = result.ducks[Math.floor(Math.random() * result.ducks.length)];
      schedule.push({ t, text: fillers[fi % fillers.length].replace('{duck}', names[rnd.ord]) });
      fi += 1;
    }

    schedule.sort((a, b) => a.t - b.t);
    for (let i = 1; i < schedule.length; i++) {
      if (schedule[i].t - schedule[i - 1].t < 1400) schedule[i].t = schedule[i - 1].t + 1400;
    }

    const timers = schedule.map((ev) => setTimeout(() => {
      commentaryId.current += 1;
      const id = commentaryId.current;
      setCommentary((prev) => [...prev, { id, text: ev.text }].slice(-2));
    }, Math.max(0, ev.t)));
    return () => timers.forEach(clearTimeout);
  }, [phase, result]);

  const stakeN = parseInt(stake, 10);
  const stakeValid = Number.isInteger(stakeN) && stakeN > 0 && stakeN <= balance;
  const pickedDuck = ducks.find((d) => d.ord === pickedOrd) || null;
  const potential = pickedDuck && stakeValid
    ? Math.round(stakeN * oddsMult(pickedDuck.odds_num, pickedDuck.odds_den)) : 0;

  async function placeBet() {
    if (!pickedOrd || !stakeValid || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api.duckyRace(lineup.lineup_id, pickedOrd, stakeN);
      setResult(res);
      setBalance(res.balance);
      setCountText('3');
      setPhase('countdown');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  if (phase === 'loading') {
    return <p className="py-10 text-center text-sm text-neutral-500">Saddling the ducks...</p>;
  }
  if (phase === 'error') {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  const water = config?.water_colour || '#4aa3c7';
  const grass = config?.grass_colour || '#5bbf3a';
  const mud = config?.mud_colour || '#6b4a2a';
  const noFunds = balance <= 0;
  const atBetting = phase === 'betting';
  const preRace = phase === 'betting' || phase === 'countdown';

  return (
    <div className="space-y-4 py-2 pb-32">
      <style>{`@keyframes ddbob{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
        @keyframes ddwave{from{background-position-x:0}to{background-position-x:-180px}}
        @keyframes ddconfetti{0%{transform:translate(0,-24px) rotate(0);opacity:1}100%{transform:translate(var(--drift),640px) rotate(720deg);opacity:1}}
        @keyframes ddcount{0%{transform:scale(1.9);opacity:0}35%{opacity:1}100%{transform:scale(1);opacity:.95}}
        @keyframes ddtickerIn{from{transform:translateY(115%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes ddtickerOut{from{transform:translateY(0);opacity:1}to{transform:translateY(-115%);opacity:0}}`}</style>

      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Ducky Derby</h1>
        <span className="text-sm font-semibold text-amber-700">{balance} pts</span>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Race track (single layered container) ---- */}
      <div className="relative isolate overflow-hidden rounded-2xl shadow-lg" style={{ height: TRACK_H, background: water }}>
        {/* far bank: grass + mud — above the water/start line, below the ducks */}
        <div className="absolute inset-x-0 top-0" style={{ height: GRASS_TOP, background: grass, zIndex: 5 }} />
        {/* cartoon grass tufts fringing the far bank — zIndex 7 so banner poles (zIndex 6) tuck behind */}
        <div className="absolute inset-x-0" style={{ top: GRASS_TOP - 22, height: 22, zIndex: 7, backgroundImage: grassBg(shade(grass, -34)), backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />
        <div className="absolute inset-x-0" style={{ top: GRASS_TOP, height: MUD_H, background: mud, zIndex: 5 }} />

        {/* cartoon wave layers */}
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 20, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 26)), backgroundRepeat: 'repeat-x', opacity: 0.55, animation: 'ddwave 7s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 80, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, -22)), backgroundRepeat: 'repeat-x', opacity: 0.4, animation: 'ddwave 11s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 140, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 40)), backgroundRepeat: 'repeat-x', opacity: 0.5, animation: 'ddwave 9s linear infinite' }} />

        {/* pole banners — placed along the course, scroll in from the right.
            No zIndex on the wrapper, so the poles (6) / cloth (8) layer around the grass (7). */}
        {bannerLayout.map((b) => (
          <div
            key={b.ord}
            ref={(el) => { bannerRefs.current[b.ord] = el; }}
            className="absolute"
            style={{ top: 6, left: preRace ? `${b.wx * 100}%` : undefined }}
          >
            <PoleBanner text={b.text} />
          </div>
        ))}

        {/* finish line (behind the ducks) */}
        <div
          ref={finishRef}
          className="absolute"
          style={{
            top: WATER_TOP - 8, left: preRace ? `${COURSE_LEN * 100}%` : undefined,
            width: 16, height: TRACK_H - WATER_TOP + 8, zIndex: 2,
            background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #fff 0% 50%) 0 0 / 16px 16px',
          }}
        />

        {/* ducks */}
        {ducks.map((d, i) => (
          <div
            key={d.ord}
            ref={(el) => { laneRefs.current[d.ord] = el; }}
            className="absolute"
            style={{ top: laneTop(i), left: preRace ? '0%' : undefined, zIndex: 10 + i }}
          >
            {bubbles[d.ord] && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-800 shadow">
                {bubbles[d.ord]}
                <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white" />
              </div>
            )}
            <div ref={(el) => { spriteRefs.current[d.ord] = el; }}
              className={phase === 'racing' ? '' : 'animate-[ddbob_2.4s_ease-in-out_infinite]'}>
              <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} w={DUCK_W} h={DUCK_H} />
            </div>
          </div>
        ))}

        {/* near bank: bottom grass — IN FRONT of the ducks */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: GRASS_BOTTOM, background: grass, zIndex: 30 }} />
        {/* cartoon grass tufts poking up off the near bank */}
        <div className="absolute inset-x-0" style={{ top: TRACK_H - GRASS_BOTTOM - 12, height: 22, zIndex: 30, backgroundImage: grassBg(shade(grass, -28)), backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />

        {/* start line (dashed) — a marking ON the water, so the ducks swim over it */}
        <div
          ref={startRef}
          className="absolute"
          style={{ top: WATER_TOP - 8, left: preRace ? `${START_WX * 100}%` : undefined, height: TRACK_H - WATER_TOP + 8, borderLeft: '3px dashed rgba(255,255,255,0.95)', zIndex: 2 }}
        />

        {/* confetti — falls from when the winner crosses the line */}
        {confetti && <Confetti />}

        {/* 3-2-1-GO! countdown overlay */}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 38 }}>
            <span
              key={countText}
              className="text-6xl font-extrabold italic text-white"
              style={{ animation: 'ddcount 0.8s ease-out', textShadow: '0 3px 12px rgba(0,0,0,0.5)' }}
            >
              {countText}
            </span>
          </div>
        )}
      </div>

      {/* ---- Live commentary ticker ---- */}
      <div className="relative h-9 overflow-hidden rounded-xl bg-neutral-900">
        {commentary.map((ln, idx) => (
          <div
            key={ln.id}
            className="absolute inset-0 flex items-center justify-center px-3 text-center text-[13px] font-semibold text-white"
            style={{ animation: `${idx === commentary.length - 1 ? 'ddtickerIn' : 'ddtickerOut'} 0.5s ease forwards` }}
          >
            {ln.text}
          </div>
        ))}
      </div>

      {/* ---- Odds list (2 per row) ---- */}
      <div>
        <p className="mb-1.5 text-sm font-semibold">Pick your duck</p>
        <div className="grid grid-cols-2 gap-2">
          {ducks.map((d) => (
            <button
              key={d.ord}
              onClick={atBetting ? () => setPickedOrd(d.ord) : undefined}
              className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                pickedOrd === d.ord ? 'border-amber-500 bg-amber-50' : 'border-neutral-200 bg-white'
              } ${atBetting ? '' : 'cursor-default'}`}
            >
              <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} w={38} h={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{d.name}</p>
                <p className="text-[11px] font-bold text-neutral-500">{oddsLabel(d.odds_num, d.odds_den)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ---- Bottom-anchored bet bar ---- */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-neutral-200 bg-white p-3 shadow-[0_-4px_14px_rgba(0,0,0,0.08)]">
        {noFunds ? (
          <p className="py-1 text-center text-sm font-medium text-amber-800">
            You need points to place a bet — win some elsewhere first!
          </p>
        ) : phase === 'betting' ? (
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[11px] text-neutral-500">Stake (max {balance})</span>
              <input
                type="number" inputMode="numeric" min={1} max={balance}
                value={stake} onChange={(e) => setStake(e.target.value)}
                className="mt-0.5 block w-full rounded-md border border-neutral-200 px-2.5 py-2 text-sm focus:border-amber-500 focus:outline-none"
                placeholder="Points"
              />
            </label>
            <button
              onClick={placeBet}
              disabled={!pickedOrd || !stakeValid || busy}
              className="shrink-0 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40"
            >
              {pickedDuck && stakeValid ? `Race to win ${potential}` : 'Place bet & race'}
            </button>
          </div>
        ) : (
          <button disabled className="w-full rounded-xl bg-neutral-200 py-2.5 text-sm font-semibold text-neutral-500">
            Race in progress…
          </button>
        )}
      </div>

      {/* ---- Result modal ---- */}
      {phase === 'result' && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
              {result.won ? 'You won!' : 'Bad luck'}
            </p>
            <p className={`mt-2 text-center text-3xl font-extrabold ${result.won ? 'text-emerald-600' : 'text-pink-500'}`}>
              {result.won ? `+${result.payout} POINTS` : `-${result.stake} POINTS`}
            </p>
            <div className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm text-neutral-700">
              {(() => {
                const winner = ducks.find((d) => d.ord === result.winner_ord);
                const mine = ducks.find((d) => d.ord === result.picked_ord);
                if (result.won) return `${winner?.name} romped home — and that was your duck!`;
                if (result.sink && result.sink.ord === result.picked_ord)
                  return `${winner?.name} won it. ${mine?.name} drowned, which is a shame.`;
                return `${winner?.name} won it. Your duck ${mine?.name} didn't have the legs.`;
              })()}
            </div>
            <p className="mt-3 text-center text-sm text-neutral-600">
              Balance: <span className="font-semibold text-neutral-900">{balance} pts</span>
            </p>
            <button
              onClick={newLineup}
              disabled={busy}
              className="mt-5 block w-full rounded-xl bg-amber-400 py-3 text-base font-semibold text-amber-950 transition hover:bg-amber-500 active:scale-95 disabled:opacity-40"
            >
              Race again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
