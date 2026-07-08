import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import RAPIER from '@dimforge/rapier2d-compat';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useTheme } from '../lib/ThemeContext.jsx';
import { useBasket } from '../lib/BasketContext.jsx';
import { hapticTap, hapticSelect, hapticSuccess } from '../lib/haptics.js';

// ── Palette (flat-colour, matches Dirdle / Tic-Tac-Face / Giftsweeper) ────────
const TEAL      = '#61dbbb';
const TEAL_SOFT = '#d3f3ea';
const PINK      = '#ee70bd';
const PINK_SOFT = '#f7c2e9';

// ── Board geometry (logical px — the canvas is drawn at devicePixelRatio and
//    CSS-scaled to fit). Physics runs in metres; PPU converts between them. ───
const BOARD_W   = 360;
const BOARD_H   = 560;
const PPU       = 40;          // pixels per physics metre
const PEG_R     = 5;           // peg radius (px)
const BALL_R    = 9;           // chip radius (px)
const TOP_PAD   = 70;          // drop zone above the first peg row
const SLOT_H    = 74;          // height of the prize-bar zone at the bottom
const SIDE_PAD  = 16;

// ── Physics tuning (expect to nudge these on-device) ─────────────────────────
const GRAVITY      = 22;       // m/s² (downward = +y in our screen-mapped world)
const RESTITUTION  = 0.42;     // peg/ball bounciness
const STEER_BASE   = 0.9;      // horizontal pull toward the target column
const STEER_DEPTH  = 5.0;      // extra pull that ramps in as the chip descends
const px = (u) => u * PPU;
const u  = (p) => p / PPU;

// Quincunx peg field. Returns peg centres (px) + the x-centres of each slot,
// derived from the same spacing so pegs, dividers and slots all line up.
function buildLayout(pegRows, slotCount) {
  const usableW = BOARD_W - SIDE_PAD * 2;
  const colGap  = usableW / slotCount;
  const fieldTop = TOP_PAD;
  const fieldBottom = BOARD_H - SLOT_H;
  const rowGap = (fieldBottom - fieldTop) / (pegRows + 1);

  const pegs = [];
  for (let r = 0; r < pegRows; r++) {
    const y = fieldTop + rowGap * (r + 1);
    // Alternate rows offset by half a column → the classic diamond lattice.
    const offset = (r % 2 === 0) ? colGap : colGap / 2;
    const count  = (r % 2 === 0) ? slotCount : slotCount + 1;
    for (let c = 0; c < count; c++) {
      const x = SIDE_PAD + offset + (c - (r % 2 === 0 ? 0.5 : 0.5)) * colGap;
      if (x > SIDE_PAD + 2 && x < BOARD_W - SIDE_PAD - 2) pegs.push({ x, y });
    }
  }
  const slotCentres = [];
  for (let i = 0; i < slotCount; i++) slotCentres.push(SIDE_PAD + colGap * (i + 0.5));
  return { pegs, slotCentres, colGap, fieldBottom };
}

export default function PlinkoPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { refresh: refreshBasket } = useBasket();
  const dark = theme === 'dark';

  const [config, setConfig]   = useState(null);
  const [balance, setBalance] = useState(0);
  const [dropping, setDropping] = useState(false);
  const [result, setResult]   = useState(null);   // { slot_index, prize, balance }
  const [error, setError]     = useState(null);
  const [physicsReady, setPhysicsReady] = useState(false);

  const canvasRef = useRef(null);
  const worldRef  = useRef(null);
  const ballRef   = useRef(null);
  const targetXRef = useRef(null);   // px x-centre the chip is steered toward
  const layoutRef = useRef(null);
  const rafRef    = useRef(0);
  const landedRef = useRef(false);
  const onLandRef = useRef(null);

  const isAdmin = user?.role === 'admin';

  // ── Load board config ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    api.plinkoConfig()
      .then((c) => { setConfig(c); setBalance(c.balance ?? 0); })
      .catch((e) => setError(e.message));
  }, [isAdmin]);

  // ── Build the physics world + render loop once config is known ───────────
  useEffect(() => {
    if (!isAdmin || !config) return undefined;
    let cancelled = false;
    const slotCount = config.slot_count;
    const layout = buildLayout(config.peg_rows, slotCount);
    layoutRef.current = layout;

    (async () => {
      try {
        await RAPIER.init();
        if (cancelled) return;
        const world = new RAPIER.World({ x: 0, y: GRAVITY });
        worldRef.current = world;

        const fixed = (x, y) => world.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(u(x), u(y)),
        );
        // Pegs
        for (const p of layout.pegs) {
          world.createCollider(RAPIER.ColliderDesc.ball(u(PEG_R)).setRestitution(RESTITUTION).setFriction(0.1), fixed(p.x, p.y));
        }
        // Side walls
        world.createCollider(RAPIER.ColliderDesc.cuboid(u(6), u(BOARD_H)).setRestitution(0.2), fixed(SIDE_PAD - 6, BOARD_H / 2));
        world.createCollider(RAPIER.ColliderDesc.cuboid(u(6), u(BOARD_H)).setRestitution(0.2), fixed(BOARD_W - SIDE_PAD + 6, BOARD_H / 2));
        // Floor
        world.createCollider(RAPIER.ColliderDesc.cuboid(u(BOARD_W), u(6)), fixed(BOARD_W / 2, BOARD_H - 3));
        // Slot dividers — thin walls between the bottom bars so the chip settles
        // cleanly into one column.
        for (let i = 1; i < slotCount; i++) {
          const x = SIDE_PAD + layout.colGap * i;
          world.createCollider(RAPIER.ColliderDesc.cuboid(u(2), u(SLOT_H / 2)), fixed(x, BOARD_H - SLOT_H / 2));
        }

        setPhysicsReady(true);
        loop();
      } catch (e) {
        setError('Could not start the physics engine.');
      }
    })();

    function loop() {
      const world = worldRef.current;
      if (!world) return;
      const ball = ballRef.current;
      if (ball) {
        // Steer horizontally toward the target column — gentle up top (natural
        // bounces), firmer as it nears the slots so it lands where the server said.
        const t = ball.translation();
        const ballY = px(t.y);
        const depth = Math.max(0, Math.min(1, (ballY - TOP_PAD) / (layout.fieldBottom - TOP_PAD)));
        const dx = u(targetXRef.current) - t.x;
        ball.applyImpulse({ x: dx * (STEER_BASE + depth * STEER_DEPTH) * 0.02, y: 0 }, true);

        // Landed? (in the slot zone and nearly still)
        const lv = ball.linvel();
        if (!landedRef.current && ballY > layout.fieldBottom + 12 && Math.abs(lv.x) + Math.abs(lv.y) < 0.4) {
          landedRef.current = true;
          onLandRef.current?.();
        }
      }
      world.step();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      worldRef.current = null;
      ballRef.current = null;
      setPhysicsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, config]);

  // ── Draw the board (flat colour + slight depth) ──────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== BOARD_W * dpr) { canvas.width = BOARD_W * dpr; canvas.height = BOARD_H * dpr; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    // Board background
    ctx.fillStyle = dark ? '#26261f' : '#ffffff';
    roundRect(ctx, 0, 0, BOARD_W, BOARD_H, 20); ctx.fill();

    // Pegs — pink discs with a soft under-shadow for a touch of depth
    for (const p of layout.pegs) {
      ctx.beginPath(); ctx.arc(p.x, p.y + 1, PEG_R, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.10)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
      ctx.fillStyle = PINK; ctx.fill();
    }

    // Bottom prize bars + scalloped top edge
    const slots = config?.slots ?? [];
    const n = layout.slotCentres.length;
    const barTop = BOARD_H - SLOT_H;
    for (let i = 0; i < n; i++) {
      const x0 = SIDE_PAD + layout.colGap * i;
      const barColor = i % 2 === 0 ? TEAL_SOFT : PINK_SOFT;
      ctx.fillStyle = barColor;
      ctx.fillRect(x0, barTop, layout.colGap, SLOT_H);
      // scallop bump on top of each bar
      ctx.beginPath();
      ctx.fillStyle = barColor;
      ctx.arc(x0 + layout.colGap / 2, barTop, layout.colGap / 2, Math.PI, 0);
      ctx.fill();
      // divider
      if (i > 0) { ctx.fillStyle = dark ? '#3a3a30' : '#e5e5e5'; ctx.fillRect(x0 - 1, barTop - 6, 2, SLOT_H + 6); }
      // label
      const label = (slots[i]?.label || '').slice(0, 10);
      if (label) {
        ctx.fillStyle = dark ? '#1c1c18' : '#3a3a38';
        ctx.font = '600 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x0 + layout.colGap / 2, barTop + SLOT_H / 2 + 3, layout.colGap - 4);
      }
    }

    // Chip
    const ball = ballRef.current;
    if (ball) {
      const t = ball.translation();
      const bx = px(t.x), by = px(t.y);
      ctx.beginPath(); ctx.arc(bx, by + 1.5, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = TEAL; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#0d3d2e'; ctx.stroke();
    }
  }, [config, dark]);

  // ── Drop: server decides the slot; we animate the chip to it ─────────────
  const drop = useCallback(async () => {
    if (dropping || !physicsReady || !worldRef.current) return;
    const cost = config?.cost_per_play ?? 100;
    if (balance < cost) { setError('Not enough points for a drop.'); return; }
    setError(null); setResult(null); setDropping(true);
    hapticTap();

    // Remove any previous chip
    if (ballRef.current) { try { worldRef.current.removeRigidBody(ballRef.current); } catch { /* ignore */ } ballRef.current = null; }

    let res;
    try {
      res = await api.plinkoDrop();
    } catch (e) {
      setError(e.message || 'Drop failed.'); setDropping(false); return;
    }
    setBalance(res.balance);
    const layout = layoutRef.current;
    targetXRef.current = layout.slotCentres[res.slot_index] ?? (BOARD_W / 2);
    landedRef.current = false;

    // Spawn the chip near the top, slightly random so runs feel alive.
    const startX = BOARD_W / 2 + (Math.random() * 40 - 20);
    const body = worldRef.current.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(u(startX), u(30)).setLinearDamping(0.15),
    );
    worldRef.current.createCollider(
      RAPIER.ColliderDesc.ball(u(BALL_R)).setRestitution(RESTITUTION).setFriction(0.15).setDensity(1.2),
      body,
    );
    ballRef.current = body;

    // Tick a light haptic as it rattles; reveal the prize when it settles.
    onLandRef.current = () => {
      const prize = res.prize;
      const won = prize && prize.prize_kind && prize.prize_kind !== 'none';
      if (won) hapticSuccess(); else hapticSelect();
      setResult(res);
      setDropping(false);
      refreshBasket?.();  // reflect the debited points + any new reward
    };
    // Safety: force-reveal if physics never settles.
    setTimeout(() => { if (!landedRef.current) { landedRef.current = true; onLandRef.current?.(); } }, 9000);
  }, [dropping, physicsReady, config, balance, refreshBasket]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-sm text-neutral-500">Plinko is still in testing.</p>
        <Link to="/" className="mt-3 inline-block text-sm font-medium" style={{ color: PINK }}>Back home</Link>
      </div>
    );
  }

  const cost = config?.cost_per_play ?? 100;
  const canDrop = physicsReady && !dropping && balance >= cost;

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="flex items-center justify-between">
        <Link to="/admin" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight" style={{ color: PINK }}>Plinko</h1>
        <span className="rounded-full px-2.5 py-1 text-sm font-semibold" style={{ background: TEAL_SOFT, color: '#0d3d2e' }}>
          {balance.toLocaleString()} pts
        </span>
      </div>

      <div className="mt-4 flex justify-center">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', maxWidth: BOARD_W, aspectRatio: `${BOARD_W} / ${BOARD_H}`, touchAction: 'none' }}
        />
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-3 rounded-xl p-3 text-center" style={{ background: TEAL_SOFT }}>
          {result.prize?.prize_kind === 'product' && (
            <p className="text-sm font-semibold" style={{ color: '#0d3d2e' }}>You won: {result.prize.product?.name ?? result.prize.label}! Check your rewards.</p>
          )}
          {result.prize?.prize_kind === 'experience' && (
            <p className="text-sm font-semibold" style={{ color: '#0d3d2e' }}>You won: {result.prize.text_label ?? result.prize.label}! Check your rewards.</p>
          )}
          {(!result.prize || result.prize.prize_kind === 'none') && (
            <p className="text-sm font-semibold" style={{ color: '#7a2f5e' }}>No prize this time. Drop again?</p>
          )}
        </div>
      )}

      <button
        onClick={drop}
        disabled={!canDrop}
        className="mt-4 w-full rounded-xl py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
        style={{ background: PINK }}
      >
        {dropping ? 'Dropping…' : `Drop a chip — ${cost} pts`}
      </button>
      {!physicsReady && !error && <p className="mt-2 text-center text-xs text-neutral-400">Warming up the board…</p>}
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
