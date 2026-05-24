import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* Side-scroller camera: course is COURSE_LEN screen-widths long; camera follows the leader. */
const COURSE_LEN = 2.5;
const ANCHOR = 0.4;
const END_X = 0.68;
const SPREAD = 235;
const START_WX = 0.2;       // start line sits a little ahead of the ducks (nudged left)
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
  return <img src={`/duck_${ord}.png?v=3`} alt="" style={{ width: w, height: h, objectFit: 'contain', display: 'block' }} onError={() => setBroken(true)} />;
}

/* A tattered, hand-painted cloth flag held up by two black poles. The poles tuck
   behind the grass tuft fringe; the cloth sits on top. zIndexes depend on whether
   the banner is planted on the top bank or the bottom bank. */
const BANNER_TATTER =
  'polygon(0% 6%, 8% 0%, 30% 7%, 52% 1%, 73% 7%, 93% 0%, 100% 9%, 96% 30%, 100% 52%, 95% 73%, 100% 92%, 92% 100%, 72% 94%, 50% 100%, 27% 94%, 8% 100%, 0% 90%, 5% 70%, 0% 50%, 5% 27%)';

function PoleBanner({ text, placement }) {
  const bottom = placement === 'bottom';
  // bottom banners sit in front of the near bank; top banners tuck behind the grass fringe
  const poleZ = bottom ? 36 : 6;
  const clothZ = bottom ? 37 : 8;
  return (
    <div className="relative">
      <div className="absolute" style={{ left: 4, top: 5, width: 5, height: 44, background: '#1a1a1a', borderRadius: 2, zIndex: poleZ }} />
      <div className="absolute" style={{ right: 4, top: 5, width: 5, height: 44, background: '#1a1a1a', borderRadius: 2, zIndex: poleZ }} />
      <div className="relative" style={{ zIndex: clothZ }}>
        {/* dark backing — shows as a tattered outline behind the cloth */}
        <div className="absolute inset-0" style={{ background: '#1a1a1a', clipPath: BANNER_TATTER }} />
        <div
          className="relative whitespace-nowrap px-3.5 py-1 text-center text-[12px] font-extrabold uppercase text-black"
          style={{ margin: 2, background: '#ffffff', clipPath: BANNER_TATTER }}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

/* A floating buoy — a coloured semicircle that bobs up and down the river. */
function Buoy({ colour }) {
  return (
    <div style={{ width: 30, height: 18, position: 'relative' }}>
      <div style={{ position: 'absolute', left: '50%', top: -5, marginLeft: -1.5, width: 3, height: 7, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ position: 'absolute', inset: 0, background: colour, borderRadius: '15px 15px 4px 4px', border: '2px solid rgba(0,0,0,0.28)' }} />
      <div style={{ position: 'absolute', left: 2, right: 2, top: '54%', height: 4, background: 'rgba(255,255,255,0.92)' }} />
    </div>
  );
}

/* A lily pad — a green disc with a little flower; crossing one gives a speed boost. */
function LilyPad() {
  return (
    <div style={{ width: 38, height: 20, borderRadius: '50%', background: '#3a9d4a', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.18)', position: 'relative' }}>
      <div style={{ position: 'absolute', left: '22%', top: '22%', width: 9, height: 9, borderRadius: '50%', background: '#ff8fc3' }} />
      <div style={{ position: 'absolute', left: '27%', top: '32%', width: 3, height: 3, borderRadius: '50%', background: '#ffe27a' }} />
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

/* obstacles: merged, at-sorted list — whirlpools ('whirl'), buoy bumps ('buoy')
   and lily-pad leaps ('pad'). Pause durations and pad leaps are baked into finishMs.
   A pad makes the duck cover `boost` progress in a short `boostMs` — a visible sprint. */
function obstacleTotals(list) {
  let pauseTotal = 0;
  let boostMsTotal = 0;
  let boostProg = 0;
  for (const o of list) {
    if (o.kind === 'pad') { boostMsTotal += o.boostMs; boostProg += o.boost; }
    else pauseTotal += o.durationMs;
  }
  return { pauseTotal, boostMsTotal, boostProg };
}

function duckState(elapsed, finishMs, obstacles) {
  const list = obstacles || [];
  const { pauseTotal, boostMsTotal, boostProg } = obstacleTotals(list);
  const movingMs = Math.max(1, finishMs - pauseTotal - boostMsTotal);
  const rate = Math.max(1 - boostProg, 0.01) / movingMs; // normal-speed progress per ms
  let rem = elapsed;
  let lastAt = 0;
  for (const ob of list) {
    const segMs = Math.max(0, ob.at - lastAt) / rate;
    if (rem < segMs) return { m: lastAt + rem * rate, pause: null };
    rem -= segMs;
    if (ob.kind === 'pad') {
      if (rem < ob.boostMs) {
        return { m: Math.min(1, ob.at + (rem / ob.boostMs) * ob.boost), pause: { kind: 'pad', frac: rem / ob.boostMs } };
      }
      rem -= ob.boostMs;
      lastAt = ob.at + ob.boost;
    } else {
      if (rem < ob.durationMs) {
        return { m: ob.at, pause: { kind: ob.kind || 'whirl', frac: rem / ob.durationMs, loops: ob.loops || 0 } };
      }
      rem -= ob.durationMs;
      lastAt = ob.at;
    }
  }
  return { m: Math.min(1, lastAt + rem * rate), pause: null };
}

/* Inverse of duckState: the elapsed ms at which a duck first reaches progress targetM. */
function progressToTime(targetM, finishMs, obstacles) {
  const list = obstacles || [];
  const { pauseTotal, boostMsTotal, boostProg } = obstacleTotals(list);
  const movingMs = Math.max(1, finishMs - pauseTotal - boostMsTotal);
  const rate = Math.max(1 - boostProg, 0.01) / movingMs;
  let t = 0;
  let lastAt = 0;
  for (const ob of list) {
    if (targetM <= ob.at) return t + Math.max(0, targetM - lastAt) / rate;
    t += Math.max(0, ob.at - lastAt) / rate;
    if (ob.kind === 'pad') { t += ob.boostMs; lastAt = ob.at + ob.boost; }
    else { t += ob.durationMs; lastAt = ob.at; }
  }
  return t + Math.max(0, targetM - lastAt) / rate;
}

/* Substitute {duck}/{duck2}/... tokens — each occurrence resolves to a different racer. */
function fillDuckTokens(text, ducks) {
  if (!ducks || !ducks.length) return text;
  const pool = [...ducks].sort(() => Math.random() - 0.5);
  let i = 0;
  return String(text).replace(/\{duck\d*\}/g, () => pool[(i++) % pool.length].name);
}

/* Photo-finish slow-mo: map real elapsed <-> race time. Outside the slow window
   the two are identical; inside it, race time advances at photo.SLOW speed. */
function realToRace(real, photo) {
  if (!photo || !photo.isPhoto || real <= photo.slowFrom) return real;
  if (real >= photo.realSlowTo) return photo.slowTo + (real - photo.realSlowTo);
  return photo.slowFrom + (real - photo.slowFrom) * photo.SLOW;
}
function raceToReal(raceT, photo) {
  if (!photo || !photo.isPhoto || raceT <= photo.slowFrom) return raceT;
  if (raceT >= photo.slowTo) return photo.realSlowTo + (raceT - photo.slowTo);
  return photo.slowFrom + (raceT - photo.slowFrom) / photo.SLOW;
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
  const [photoFlash, setPhotoFlash] = useState(false);
  const [commentary, setCommentary] = useState([]);

  const laneRefs = useRef({});
  const spriteRefs = useRef({});
  const bannerRefs = useRef({});
  const buoyRefs = useRef({});
  const padRefs = useRef({});
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
      setPhotoFlash(false);
      sinkRef.current = null;
      // clear any leftover sink animation from the previous race's sprites
      Object.values(spriteRefs.current).forEach((el) => {
        if (el) { el.style.opacity = '1'; el.style.transform = ''; }
      });
      commentaryId.current = 0;
      setCommentary([]);
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

  /* banners — spread evenly start-to-end; top and bottom banks spaced independently */
  const bannerLayout = useMemo(() => {
    const active = (config?.banners || []).filter((b) => b.active && b.text.trim());
    const spread = (group) => {
      const k = group.length;
      const lo = 0.36;
      const hi = COURSE_LEN - 0.16;
      return group.map((b, i) => ({
        ...b,
        wx: k <= 1 ? (lo + hi) / 2 : lo + (hi - lo) * (i / (k - 1)),
      }));
    };
    return [
      ...spread(active.filter((b) => (b.placement || 'top') === 'top')),
      ...spread(active.filter((b) => (b.placement || 'top') === 'bottom')),
    ];
  }, [config]);

  /* buoys + lily pads laid out along the course, in each duck's lane */
  const courseObjects = useMemo(() => {
    if (!result) return { buoys: [], pads: [] };
    const buoys = [];
    const pads = [];
    result.ducks.forEach((d, i) => {
      const laneY = WATER_TOP - TOP_OVERLAP + i * LANE_GAP;
      (result.whirlpools?.[d.ord] || []).forEach((o, k) => {
        if (o.kind === 'buoy') {
          buoys.push({
            key: `b${d.ord}-${k}`, wx: o.at * COURSE_LEN, y: laneY + 24,
            colour: o.colour || '#e0322e',
            dur: 3 + Math.random() * 2.6,
            delay: (o.fromTop ? 0 : -2) - Math.random() * 1.8,
          });
        } else if (o.kind === 'pad') {
          pads.push({ key: `p${d.ord}-${k}`, wx: o.at * COURSE_LEN, y: laneY + 30 });
        }
      });
    });
    return { buoys, pads };
  }, [result]);

  /* photo finish — if the top two finish within a whisker, slow-mo + a camera flash kick in */
  const photo = useMemo(() => {
    if (!result) return null;
    const sink = result.sink;
    const vals = Object.entries(result.finish_ms)
      .filter(([ord]) => !sink || Number(ord) !== sink.ord)
      .map((e) => e[1]).sort((a, b) => a - b);
    const winMs = vals[0];
    const secondMs = vals[1] ?? winMs;
    const maxMs = vals[vals.length - 1];
    const isPhoto = vals.length >= 2 && secondMs - winMs <= 650;
    const SLOW = 0.4;
    const slowFrom = winMs - 1200;
    const slowTo = secondMs + 250;
    const realSlowTo = slowFrom + (slowTo - slowFrom) / SLOW;
    return {
      isPhoto, SLOW, slowFrom, slowTo, winMs, secondMs, maxMs, realSlowTo,
      raceEndMs: isPhoto ? slowTo + 700 : maxMs + 600,
      realEndMs: isPhoto ? realSlowTo + 900 : maxMs + 800,
    };
  }, [result]);

  /* ---- rAF race animation ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result || !photo) return;
    const t0 = performance.now();
    let raf;
    const sink = result.sink;
    const tick = (now) => {
      const realElapsed = now - t0;
      const elapsed = realToRace(realElapsed, photo); // race time (slowed near a photo finish)
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
          if (s.pause && !sinking && s.pause.kind === 'whirl') {
            const ang = s.pause.frac * s.pause.loops * Math.PI * 2;
            lane.style.transform = `translate(${Math.cos(ang) * 16}px, ${Math.sin(ang) * 12}px)`;
          } else if (s.pause && !sinking && s.pause.kind === 'buoy') {
            lane.style.transform = `translate(${Math.sin(s.pause.frac * Math.PI * 9) * 3}px, 0)`;
          } else {
            lane.style.transform = 'translate(0, 0)';
          }
        }
        if (sinking) {
          if (sinkRef.current == null) sinkRef.current = realElapsed;
          const sp = clamp((realElapsed - sinkRef.current) / 1100, 0, 1);
          if (sprite) {
            sprite.style.transform = `translateY(${sp * 42}px) rotate(${sp * 28}deg)`;
            sprite.style.opacity = `${1 - sp}`;
          }
        } else if (sprite) {
          // lily-pad leap — the duck stretches forward as it sprints
          const surge = s.pause && s.pause.kind === 'pad' ? Math.sin(s.pause.frac * Math.PI) : 0;
          const rot = Math.sin(elapsed / 320 + i) * 6;
          sprite.style.transform = `rotate(${rot}deg) scaleX(${(1 + 0.34 * surge).toFixed(3)})`;
        }
      }
      if (finishRef.current) finishRef.current.style.left = `${(COURSE_LEN - camX) * 100}%`;
      if (startRef.current) startRef.current.style.left = `${(START_WX - camX) * 100}%`;
      for (const b of bannerLayout) {
        const el = bannerRefs.current[b.ord];
        if (el) el.style.left = `${(b.wx - camX) * 100}%`;
      }
      for (const b of courseObjects.buoys) {
        const el = buoyRefs.current[b.key];
        if (el) el.style.left = `${(b.wx - camX) * 100}%`;
      }
      for (const p of courseObjects.pads) {
        const el = padRefs.current[p.key];
        if (el) el.style.left = `${(p.wx - camX) * 100}%`;
      }

      if (elapsed < photo.raceEndMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, laneIndex, n, bannerLayout, courseObjects, photo]);

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

  /* ---- race finish: confetti, photo-finish flash, result modal ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result || !photo) return;
    const timers = [];
    timers.push(setTimeout(() => setConfetti(true), Math.max(0, raceToReal(photo.winMs, photo))));
    if (photo.isPhoto) {
      timers.push(setTimeout(() => setPhotoFlash(true), Math.max(0, photo.slowFrom)));
      timers.push(setTimeout(() => setPhotoFlash(false), Math.max(0, photo.realSlowTo)));
    }
    resultTimer.current = setTimeout(() => {
      setPhase('result');
      if (refreshBasket) refreshBasket();
    }, photo.realEndMs);
    timers.push(resultTimer.current);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  /* ---- live race commentary ---- */
  useEffect(() => {
    if (phase !== 'racing' || !result || !photo) return;
    const names = {};
    result.ducks.forEach((d) => { names[d.ord] = d.name; });
    const sink = result.sink;
    const winMs = photo.winMs;
    const schedule = [{ t: 250, text: "And they're off!" }];

    // whirlpool / buoy / lily-pad callouts — a few, spread out
    const hitEvents = [];
    for (const d of result.ducks) {
      if (sink && d.ord === sink.ord) continue;
      const F = result.finish_ms[d.ord];
      const obs = result.whirlpools?.[d.ord] || [];
      for (const o of obs) {
        const t = progressToTime(o.at, F, obs);
        if (t > 2000 && t < winMs - 3000) {
          let text;
          if (o.kind === 'buoy') text = `${names[d.ord]} clatters into a buoy!`;
          else if (o.kind === 'pad') text = `${names[d.ord]} catches a lily pad and surges!`;
          else text = `${names[d.ord]} hits the rapids!`;
          hitEvents.push({ t, text });
        }
      }
    }
    hitEvents.sort((a, b) => a.t - b.t);
    let lastHit = -9999;
    let hitCount = 0;
    for (const e of hitEvents) {
      if (hitCount >= 5) break;
      if (e.t - lastHit > 3000) { schedule.push(e); lastHit = e.t; hitCount += 1; }
    }

    // sink callout
    if (sink) {
      const st = progressToTime(sink.at, result.finish_ms[sink.ord], result.whirlpools?.[sink.ord] || []);
      schedule.push({ t: st, text: `Disaster — ${names[sink.ord]} has gone under!` });
    }

    schedule.push({ t: winMs * 0.42, text: "It's neck and neck out there!" });
    schedule.push({ t: winMs - 3400, text: 'Into the final stretch!' });
    if (photo.isPhoto) {
      schedule.push({ t: winMs - 600, text: 'Photo finish — too close to call!' });
      schedule.push({ t: winMs + 60, text: `${names[result.winner_ord]} edges it on the line!` });
    } else {
      schedule.push({ t: winMs - 150, text: `${names[result.winner_ord]} romps home to take it!` });
    }

    // admin-editable filler lines between the beats
    const fillers = (config?.commentary || [])
      .filter((c) => c.active && c.text.trim())
      .map((c) => c.text);
    if (fillers.length) {
      let fi = Math.floor(Math.random() * fillers.length);
      for (let t = 3400; t < winMs - 4200; t += 3600) {
        schedule.push({ t, text: fillDuckTokens(fillers[fi % fillers.length], result.ducks) });
        fi += 1;
      }
    }

    schedule.sort((a, b) => a.t - b.t);
    for (let i = 1; i < schedule.length; i++) {
      if (schedule[i].t - schedule[i - 1].t < 1400) schedule[i].t = schedule[i - 1].t + 1400;
    }

    const timers = schedule.map((ev) => setTimeout(() => {
      commentaryId.current += 1;
      const id = commentaryId.current;
      setCommentary((prev) => [...prev, { id, text: ev.text }].slice(-2));
    }, Math.max(0, raceToReal(ev.t, photo))));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result, config]);

  /* ---- pre-race intro commentary cycle (admin-editable, during betting) ---- */
  useEffect(() => {
    if (phase !== 'betting' || !lineup) return;
    const ds = lineup.ducks || [];
    const lines = (config?.intro || [])
      .filter((r) => r.active && r.text.trim())
      .map((r) => fillDuckTokens(r.text, ds));
    if (!lines.length) return;
    const timers = lines.map((text, i) => setTimeout(() => {
      commentaryId.current += 1;
      const id = commentaryId.current;
      setCommentary((prev) => [...prev, { id, text }].slice(-2));
    }, i * 2500));
    return () => timers.forEach(clearTimeout);
  }, [phase, lineup, config]);

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
        @keyframes ddtickerOut{from{transform:translateY(0);opacity:1}to{transform:translateY(-115%);opacity:0}}
        @keyframes ddbuoy{0%,100%{transform:translateY(-20px)}50%{transform:translateY(20px)}}
        @keyframes ddflash{0%{opacity:0}7%{opacity:.92}17%{opacity:0}30%{opacity:.72}42%{opacity:0}100%{opacity:0}}`}</style>

      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Ducky Derby</h1>
        <span className="text-sm font-semibold text-amber-700">{balance} pts</span>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* ---- Race track (single layered container) ---- */}
      <div className="relative isolate overflow-hidden rounded-2xl shadow-lg" style={{ height: TRACK_H, background: water }}>
       {/* scene layer */}
       <div className="absolute inset-0">
        {/* far bank: grass + mud — above the water/start line, below the ducks */}
        <div className="absolute inset-x-0 top-0" style={{ height: GRASS_TOP, background: grass, zIndex: 5 }} />
        {/* cartoon grass tufts fringing the far bank — zIndex 7 so banner poles (zIndex 6) tuck behind */}
        <div className="absolute inset-x-0" style={{ top: GRASS_TOP - 22, height: 22, zIndex: 7, backgroundImage: grassBg(shade(grass, -34)), backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />
        <div className="absolute inset-x-0" style={{ top: GRASS_TOP, height: MUD_H, background: mud, zIndex: 5 }} />

        {/* cartoon wave layers */}
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 20, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 26)), backgroundRepeat: 'repeat-x', opacity: 0.55, animation: 'ddwave 7s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 80, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, -22)), backgroundRepeat: 'repeat-x', opacity: 0.4, animation: 'ddwave 11s linear infinite' }} />
        <div className="absolute inset-x-0" style={{ top: WATER_TOP + 140, height: 30, zIndex: 1, backgroundImage: waveBg(shade(water, 40)), backgroundRepeat: 'repeat-x', opacity: 0.5, animation: 'ddwave 9s linear infinite' }} />

        {/* pole banners — top or bottom bank, spread evenly along the course */}
        {bannerLayout.map((b) => {
          const isBottom = (b.placement || 'top') === 'bottom';
          return (
            <div
              key={b.ord}
              ref={(el) => { bannerRefs.current[b.ord] = el; }}
              className="absolute"
              style={{ top: isBottom ? TRACK_H - GRASS_BOTTOM - 41 : 6, left: preRace ? `${b.wx * 100}%` : undefined }}
            >
              <PoleBanner text={b.text} placement={b.placement} />
            </div>
          );
        })}

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

        {/* lily pads — speed-boost spots, behind the ducks */}
        {courseObjects.pads.map((p) => (
          <div
            key={p.key}
            ref={(el) => { padRefs.current[p.key] = el; }}
            className="absolute"
            style={{ top: p.y, left: preRace ? `${p.wx * 100}%` : undefined, zIndex: 7 }}
          >
            <LilyPad />
          </div>
        ))}

        {/* buoys — floating obstacles that bob up and down the river */}
        {courseObjects.buoys.map((b) => (
          <div
            key={b.key}
            ref={(el) => { buoyRefs.current[b.key] = el; }}
            className="absolute"
            style={{ top: b.y, left: preRace ? `${b.wx * 100}%` : undefined, zIndex: 9, animation: `ddbuoy ${b.dur}s ease-in-out ${b.delay}s infinite` }}
          >
            <Buoy colour={b.colour} />
          </div>
        ))}

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
            <div
              ref={(el) => { spriteRefs.current[d.ord] = el; }}
              className={phase === 'racing' ? '' : 'animate-[ddbob_2.4s_ease-in-out_infinite]'}
              style={{ animationDelay: `${(-((i * 0.7) % 2.4)).toFixed(2)}s` }}
            >
              <DuckSprite ord={d.ord} duckColour={d.duck_colour} billColour={d.bill_colour} w={DUCK_W} h={DUCK_H} />
            </div>
          </div>
        ))}

        {/* near bank: bottom grass — IN FRONT of the ducks */}
        <div className="absolute inset-x-0 bottom-0" style={{ height: GRASS_BOTTOM, background: grass, zIndex: 30 }} />
        {/* cartoon grass tufts poking up off the near bank — zIndex 33 so bottom-bank
            banner poles (zIndex 31) tuck behind */}
        <div className="absolute inset-x-0" style={{ top: TRACK_H - GRASS_BOTTOM - 12, height: 22, zIndex: 33, backgroundImage: grassBg(shade(grass, -28)), backgroundRepeat: 'repeat-x', backgroundPosition: 'bottom' }} />

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

        {/* photo-finish camera flash */}
        {photoFlash && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: '#ffffff', zIndex: 39, animation: 'ddflash 1.5s ease-out forwards' }}
          />
        )}
       </div>
      </div>

      {/* ---- Live commentary ticker ---- */}
      <div className="relative h-9 overflow-hidden rounded-xl border border-teal-400 bg-teal-50">
        {commentary.map((ln, idx) => (
          <div
            key={ln.id}
            className="absolute inset-0 flex items-center justify-center px-3 text-center text-[13px] font-semibold text-black"
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
            <div className="-mt-1 mb-1 flex justify-center">
              <DuckSprite
                ord={result.winner_ord}
                duckColour={ducks.find((d) => d.ord === result.winner_ord)?.duck_colour}
                billColour={ducks.find((d) => d.ord === result.winner_ord)?.bill_colour}
                w={104}
                h={92}
              />
            </div>
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
                return `${winner?.name} won it. Your duck ${mine?.name} just didn't have the legs.`;
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
