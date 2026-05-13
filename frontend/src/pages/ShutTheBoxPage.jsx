import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, RoundedBox, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* ============================================================================
 * Game constants
 * ========================================================================== */

const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// "I_MISS_U!" — 2 and 7 are blank tiles
const LETTERS = { 1: 'I', 2: '', 3: 'M', 4: 'I', 5: 'S', 6: 'S', 7: '', 8: 'U', 9: '!' };

const BOX_COLOUR = '#0b8476';          // dark teal — frame + tiles
const BOX_DARK_COLOUR = '#085f55';     // even darker teal — base
const INK_COLOUR = '#faf5e6';          // numbers + letters
const FELT_COLOUR = '#15b8a6';         // medium teal felt
const TABLE_COLOUR = '#d3f3ea';

const TEAL_BTN =
  'inline-flex items-center justify-center rounded-xl bg-teal-300 px-5 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95 disabled:opacity-40';
const PALE_BTN =
  'rounded-xl border border-neutral-300 bg-white py-2 px-4 text-sm font-medium text-neutral-700 disabled:opacity-30';

function hasValidClose(openTiles, target) {
  const n = openTiles.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += openTiles[i];
    if (sum === target) return true;
  }
  return false;
}

/* ============================================================================
 * Felt fabric texture
 * ========================================================================== */

function makeFeltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  // teal base
  ctx.fillStyle = FELT_COLOUR;
  ctx.fillRect(0, 0, 512, 512);
  // fibre noise (dark teal + occasional cream)
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = Math.random();
    ctx.fillStyle = v > 0.6
      ? `rgba(255,255,255,${0.04 + Math.random() * 0.08})`
      : `rgba(8,80,72,${0.06 + Math.random() * 0.12})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // short fibre strokes
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 2 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 1.5);
  return tex;
}

/* ============================================================================
 * Dice — frosted glass, rounded, with pip textures on small face planes
 * ========================================================================== */

const PIP_PATTERNS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.28, 0.72], [0.72, 0.28], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [0.75, 0.75]],
  6: [[0.27, 0.25], [0.27, 0.5], [0.27, 0.75], [0.73, 0.25], [0.73, 0.5], [0.73, 0.75]],
};

function makePipTexture(value) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#1c0d05';
  (PIP_PATTERNS[value] || []).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * 256, y * 256, 18, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Die is 30% smaller — 0.385 cube
const DIE_SIZE = 0.385;
const DIE_HALF = DIE_SIZE / 2;
const PIP_OFFSET = DIE_HALF + 0.006;
const PIP_PLANE = DIE_SIZE * 0.78;

const FACE_VALUES_LAYOUT = [
  { value: 1, pos: [0, PIP_OFFSET, 0], rot: [-Math.PI / 2, 0, 0] },
  { value: 6, pos: [0, -PIP_OFFSET, 0], rot: [Math.PI / 2, 0, 0] },
  { value: 2, pos: [0, 0, PIP_OFFSET], rot: [0, 0, 0] },
  { value: 5, pos: [0, 0, -PIP_OFFSET], rot: [0, Math.PI, 0] },
  { value: 3, pos: [PIP_OFFSET, 0, 0], rot: [0, Math.PI / 2, 0] },
  { value: 4, pos: [-PIP_OFFSET, 0, 0], rot: [0, -Math.PI / 2, 0] },
];

const FACE_QUATS = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
  2: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
  5: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  3: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
  4: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)),
};

function Die({ value, throwSeed, throwVec, indexOffset, visible }) {
  const groupRef = useRef();
  const animRef = useRef({ active: false });

  const pipTextures = useMemo(() => ({
    1: makePipTexture(1), 2: makePipTexture(2), 3: makePipTexture(3),
    4: makePipTexture(4), 5: makePipTexture(5), 6: makePipTexture(6),
  }), []);

  useEffect(() => {
    if (!throwSeed || !visible) {
      animRef.current.active = false;
      return;
    }
    const seedRand = (i) => {
      const x = Math.sin(throwSeed * 9301 + i * 49297 + indexOffset * 233) * 43758;
      return x - Math.floor(x);
    };
    // Horizontal swipe biases x landing
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 200)) : 0;
    const lane = indexOffset === 0 ? -1 : 1;
    animRef.current = {
      active: true,
      startTime: performance.now() / 1000,
      duration: 1.45,
      startPos: new THREE.Vector3(
        lane * 0.8 - swipeX * 1.8,
        3.5 + seedRand(1) * 0.4,
        -1.0
      ),
      endPos: new THREE.Vector3(
        lane * 0.6 + swipeX * 1.2 + (seedRand(2) - 0.5) * 0.5,
        DIE_HALF + 0.01,
        0.4 + (seedRand(3) - 0.5) * 0.5
      ),
      spinAxis: new THREE.Vector3(seedRand(4) - 0.5, seedRand(5) - 0.5, seedRand(6) - 0.5).normalize(),
      spinSpeed: 14 + seedRand(7) * 6,
      targetQuat: FACE_QUATS[value].clone(),
      midQuat: new THREE.Quaternion(),
    };
    if (groupRef.current) {
      groupRef.current.position.copy(animRef.current.startPos);
      groupRef.current.quaternion.identity();
    }
  }, [throwSeed, value, indexOffset, visible, throwVec]);

  useFrame((state) => {
    const a = animRef.current;
    if (!a.active || !groupRef.current) return;
    const elapsed = state.clock.elapsedTime - a.startTime;
    const t = Math.min(elapsed / a.duration, 1);
    if (t < 0.78) {
      const k = t / 0.78;
      groupRef.current.position.x = THREE.MathUtils.lerp(a.startPos.x, a.endPos.x, k);
      groupRef.current.position.z = THREE.MathUtils.lerp(a.startPos.z, a.endPos.z, k);
      groupRef.current.position.y =
        THREE.MathUtils.lerp(a.startPos.y, a.endPos.y, k) + Math.sin(k * Math.PI) * 1.2;
      groupRef.current.quaternion.setFromAxisAngle(a.spinAxis, elapsed * a.spinSpeed);
      a.midQuat.copy(groupRef.current.quaternion);
    } else if (t < 1) {
      const k = (t - 0.78) / 0.22;
      const ease = 1 - Math.pow(1 - k, 3);
      groupRef.current.position.copy(a.endPos);
      groupRef.current.quaternion.slerpQuaternions(a.midQuat, a.targetQuat, ease);
    } else {
      groupRef.current.position.copy(a.endPos);
      groupRef.current.quaternion.copy(a.targetQuat);
      a.active = false;
    }
  });

  if (!visible) return null;
  return (
    <group ref={groupRef}>
      <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={0.05} smoothness={4} castShadow>
        <MeshTransmissionMaterial
          transmission={0.85}
          roughness={0.45}
          thickness={0.3}
          ior={1.45}
          chromaticAberration={0.02}
          color="#ffffff"
          samples={4}
          resolution={256}
        />
      </RoundedBox>
      {FACE_VALUES_LAYOUT.map((f) => (
        <mesh key={f.value} position={f.pos} rotation={f.rot}>
          <planeGeometry args={[PIP_PLANE, PIP_PLANE]} />
          <meshStandardMaterial map={pipTextures[f.value]} transparent roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================================
 * Tile — flat teal board, reclined when open, flips forward when closed
 * ========================================================================== */

const TILE_W = 0.42;
const TILE_H = 0.75;
const TILE_D = 0.1;
const TILE_OPEN_ANGLE = -Math.PI / 12; // ~15° backward lean

function Tile({ value, x, closed, selected, onClick }) {
  const groupRef = useRef();
  const angleRef = useRef(TILE_OPEN_ANGLE);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : TILE_OPEN_ANGLE;
    const k = Math.min(delta * 9, 1);
    angleRef.current += (target - angleRef.current) * k;
    groupRef.current.rotation.x = angleRef.current;
  });

  const tileColor = selected ? '#1aa999' : BOX_COLOUR;

  return (
    <group ref={groupRef} position={[x, 0.08, -1.0]}>
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(value);
        }}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial color={tileColor} roughness={0.55} />
      </mesh>
      {/* Number on +Z (front) face */}
      <Text
        position={[0, TILE_H / 2, TILE_D / 2 + 0.001]}
        fontSize={0.38}
        color={INK_COLOUR}
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>
      {/* Letter on -Z (back) face, rotation [π,0,0] reads upright when tile is flat */}
      <Text
        position={[0, TILE_H / 2, -TILE_D / 2 - 0.001]}
        rotation={[Math.PI, 0, 0]}
        fontSize={0.42}
        color={INK_COLOUR}
        anchorX="center"
        anchorY="middle"
      >
        {LETTERS[value] || ''}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Box frame + felt floor
 * ========================================================================== */

const BOX_W = 5.6;
const BOX_D = 3.0;
const WALL_H = 0.65;
const WALL_THICK = 0.22;

function BoxFrame({ feltTex }) {
  const R = 0.05; // corner radius for rounded box edges
  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.02, 0.01, BOX_D - WALL_THICK * 2 + 0.02]} />
        <meshStandardMaterial map={feltTex} color={FELT_COLOUR} roughness={0.95} />
      </mesh>
      {/* Floor base — rounded box */}
      <RoundedBox
        args={[BOX_W, 0.12, BOX_D]}
        radius={R}
        smoothness={3}
        position={[0, -0.06, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={BOX_DARK_COLOUR} roughness={0.6} />
      </RoundedBox>
      {/* Left wall */}
      <RoundedBox
        args={[WALL_THICK, WALL_H, BOX_D]}
        radius={R}
        smoothness={3}
        position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOX_COLOUR} roughness={0.6} />
      </RoundedBox>
      {/* Right wall */}
      <RoundedBox
        args={[WALL_THICK, WALL_H, BOX_D]}
        radius={R}
        smoothness={3}
        position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOX_COLOUR} roughness={0.6} />
      </RoundedBox>
      {/* Back wall */}
      <RoundedBox
        args={[BOX_W, WALL_H, WALL_THICK]}
        radius={R}
        smoothness={3}
        position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOX_COLOUR} roughness={0.6} />
      </RoundedBox>
      {/* Front wall (lower) */}
      <RoundedBox
        args={[BOX_W, 0.4, WALL_THICK]}
        radius={R}
        smoothness={3}
        position={[0, 0.2, BOX_D / 2 - WALL_THICK / 2]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={BOX_COLOUR} roughness={0.6} />
      </RoundedBox>
      {/* Rod */}
      <mesh position={[0, 0.08, -1.0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial color={BOX_DARK_COLOUR} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Scene
 * ========================================================================== */

function Scene({ openTiles, selected, dice, throwSeed, throwVec, onTileTap }) {
  const feltTex = useMemo(() => makeFeltTexture(), []);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 8, 4]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />

      <BoxFrame feltTex={feltTex} />

      {ALL_TILES.map((v, i) => {
        const x = (i - 4) * 0.5;
        return (
          <Tile
            key={v}
            value={v}
            x={x}
            closed={!openTiles.includes(v)}
            selected={selected.includes(v)}
            onClick={onTileTap}
          />
        );
      })}

      <Die value={dice[0] || 1} indexOffset={0} throwSeed={throwSeed} throwVec={throwVec} visible={!!dice[0]} />
      <Die value={dice[1] || 1} indexOffset={1} throwSeed={throwSeed} throwVec={throwVec} visible={!!dice[1]} />
    </>
  );
}

/* ============================================================================
 * Main page
 * ========================================================================== */

export default function ShutTheBoxPage() {
  const { refresh: refreshBasket } = useBasket();
  const [quota, setQuota] = useState({ games_used_today: 0, games_limit: 5, games_remaining: 5 });
  const [game, setGame] = useState(null);
  const [openTiles, setOpenTiles] = useState([...ALL_TILES]);
  const [selected, setSelected] = useState([]);
  const [dice, setDice] = useState([null, null]);
  const [throwSeed, setThrowSeed] = useState(0);
  const [throwVec, setThrowVec] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const diceSum = (dice[0] || 0) + (dice[1] || 0);
  const selectedSum = useMemo(() => selected.reduce((a, b) => a + b, 0), [selected]);
  const canConfirm = phase === 'rolled' && selectedSum === diceSum && selected.length > 0;
  const quotaExhausted = (quota.games_remaining != null) && quota.games_remaining <= 0 && phase === 'idle';

  async function loadQuota() {
    try { setQuota(await api.stbState()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { loadQuota(); }, []);

  async function newGame() {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    try {
      const g = await api.stbStart();
      setGame(g);
      setOpenTiles([...ALL_TILES]);
      setSelected([]);
      setDice([null, null]);
      setThrowSeed(0);
      setPhase('idle');
      await loadQuota();
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function triggerRoll(swipeVec = null) {
    if (!game || phase === 'rolled' || phase === 'rolling' || busy) return;
    setMessage('');
    setPhase('rolling');
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    setDice([d1, d2]);
    setThrowVec(swipeVec);
    setThrowSeed((s) => s + 1);
    setTimeout(() => {
      const target = d1 + d2;
      if (!hasValidClose(openTiles, target)) {
        setPhase('over');
        setMessage(`No valid combination for ${target}. Game over!`);
        api.stbEnd({ game_id: game.id, result: 'loss', final_tiles_open: openTiles }).catch(() => {});
      } else {
        setPhase('rolled');
      }
    }, 1500);
  }

  function tapTile(v) {
    if (phase !== 'rolled') return;
    setSelected((sel) => (sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]));
  }

  async function confirmClose() {
    if (!canConfirm) return;
    const newOpen = openTiles.filter((t) => !selected.includes(t));
    setOpenTiles(newOpen);
    setSelected([]);
    setDice([null, null]);
    if (newOpen.length === 0) {
      setPhase('won');
      setMessage('You shut the box!');
      setBusy(true);
      try {
        const res = await api.stbEnd({ game_id: game.id, result: 'win', final_tiles_open: [] });
        if (refreshBasket) await refreshBasket();
        setMessage(`You shut the box! +${res.credited_pts} pts and a dice trophy.`);
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    } else {
      setPhase('idle');
    }
  }

  async function resetGame() {
    if (!confirm('Reset this game?')) return;
    if (game && phase !== 'won') {
      try { await api.stbEnd({ game_id: game.id, result: 'abandoned', final_tiles_open: openTiles }); } catch {}
    }
    setGame(null);
    setOpenTiles([...ALL_TILES]);
    setSelected([]);
    setDice([null, null]);
    setThrowSeed(0);
    setPhase('idle');
    setMessage('');
    await loadQuota();
  }

  /* --- Swipe-to-throw — now left/right --- */
  const swipeStart = useRef(null);
  function onPointerDown(e) {
    if (phase !== 'idle' || !game) return;
    swipeStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onPointerUp(e) {
    const s = swipeStart.current;
    swipeStart.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = Math.max(1, performance.now() - s.t);
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    if (Math.abs(dx) > 40 && Math.abs(dy) < Math.abs(dx) * 0.8 && speed > 0.25) {
      triggerRoll({ x: dx, y: dy });
    }
  }

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Shut Katie's Box</h1>
        {game ? (
          <button onClick={resetGame} disabled={busy} className="text-sm font-medium text-neutral-500 disabled:opacity-30">Reset</button>
        ) : <span className="w-10" />}
      </div>

      {/* 3D scene — box-shaped aspect (7:5), transparent canvas over teal table */}
      <div
        className="overflow-hidden rounded-2xl shadow-lg"
        style={{
          aspectRatio: '7 / 5',
          background: TABLE_COLOUR,
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 5.6, 5.1], fov: 40 }}
          gl={{ antialias: true, alpha: true }}
        >
          <Suspense fallback={null}>
            <Scene
              openTiles={openTiles}
              selected={selected}
              dice={dice}
              throwSeed={throwSeed}
              throwVec={throwVec}
              onTileTap={tapTile}
            />
          </Suspense>
        </Canvas>
      </div>

      {phase === 'idle' && game && (
        <p className="text-center text-xs text-neutral-500">Swipe across the box to throw, or tap Roll.</p>
      )}

      {(message || phase === 'rolled') && (
        <div className="rounded-xl bg-white border border-neutral-200 p-3 text-center text-sm">
          {phase === 'rolled' && !message && (
            <>You rolled <strong>{diceSum}</strong>. Tap open tiles that sum to {diceSum}.{' '}
              <span className="text-neutral-500">Selected: {selectedSum}</span>
            </>
          )}
          {message && (
            <span
              className={
                phase === 'won'
                  ? 'font-semibold text-teal-700'
                  : phase === 'over'
                  ? 'font-semibold text-pink-600'
                  : ''
              }
            >
              {message}
            </span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {!game ? (
          <button onClick={newGame} disabled={busy || quotaExhausted} className={`flex-1 ${TEAL_BTN}`}>
            {busy ? '...' : 'Start game'}
          </button>
        ) : phase === 'over' || phase === 'won' ? (
          <button onClick={newGame} disabled={busy || quotaExhausted} className={`flex-1 ${TEAL_BTN}`}>
            New game
          </button>
        ) : phase === 'rolled' ? (
          <>
            <button onClick={() => setSelected([])} disabled={selected.length === 0} className={`flex-1 ${PALE_BTN}`}>Clear</button>
            <button onClick={confirmClose} disabled={!canConfirm || busy} className={`flex-1 ${TEAL_BTN}`}>
              Close tiles ({selectedSum}/{diceSum})
            </button>
          </>
        ) : (
          <button
            onClick={() => triggerRoll(null)}
            disabled={phase === 'rolling' || busy}
            className={`flex-1 ${TEAL_BTN}`}
          >
            {phase === 'rolling' ? 'Rolling...' : 'Roll the dice'}
          </button>
        )}
      </div>

      {quota.games_limit != null && (
        <p className="text-center text-xs text-neutral-500">
          {quotaExhausted
            ? 'No more games today - come back tomorrow.'
            : `${quota.games_remaining} game${quota.games_remaining === 1 ? '' : 's'} left today`}
        </p>
      )}
    </div>
  );
}
