import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* ============================================================================
 * Game constants
 * ========================================================================== */

const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
// Reveal letters when tiles close, spelling "YOU SUCK!" (4 = blank space)
const LETTERS = { 1: 'Y', 2: 'O', 3: 'U', 4: '', 5: 'S', 6: 'U', 7: 'C', 8: 'K', 9: '!' };

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
 * Procedural textures
 * ========================================================================== */

function makeFeltTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  // base pink
  ctx.fillStyle = '#fbb8d8';
  ctx.fillRect(0, 0, 512, 512);
  // dense fibre noise
  for (let i = 0; i < 18000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = Math.random();
    ctx.fillStyle = v > 0.6 ? `rgba(255,255,255,${0.04 + Math.random() * 0.08})` : `rgba(190,90,140,${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // short fibre strokes for texture
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

function makeWalnutTexture(seed = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  // base
  ctx.fillStyle = '#5a3618';
  ctx.fillRect(0, 0, 512, 512);
  // grain bands
  for (let y = 0; y < 512; y++) {
    const n = Math.sin((y + seed * 7) * 0.06) + Math.sin((y + seed) * 0.018) * 0.6 + Math.sin(y * 0.003) * 0.4;
    const a = Math.abs(n) * 0.18;
    ctx.fillStyle = `rgba(20,8,2,${a})`;
    ctx.fillRect(0, y, 512, 1);
    ctx.fillStyle = `rgba(120,70,30,${a * 0.6})`;
    ctx.fillRect(0, y + 0.5, 512, 0.5);
  }
  // wood rings (off-canvas centre)
  const cx = 256 + (seed % 100);
  const cy = 700 + (seed * 13) % 200;
  for (let r = 0; r < 1200; r += 7 + Math.random() * 8) {
    ctx.strokeStyle = `rgba(20,10,3,${0.1 + Math.random() * 0.18})`;
    ctx.lineWidth = 0.8 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // a couple of darker knots
  for (let i = 0; i < 2; i++) {
    const x = 100 + Math.random() * 312;
    const y = 100 + Math.random() * 312;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 25);
    g.addColorStop(0, 'rgba(15,7,2,0.7)');
    g.addColorStop(1, 'rgba(15,7,2,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 30, y - 30, 60, 60);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeMapleTexture(seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  // base maple/pine
  ctx.fillStyle = '#d9b88a';
  ctx.fillRect(0, 0, 256, 256);
  // soft vertical grain
  for (let y = 0; y < 256; y++) {
    const n = Math.sin((y + seed * 11) * 0.08) + Math.sin((y + seed) * 0.02) * 0.5;
    const a = Math.abs(n) * 0.12;
    ctx.fillStyle = `rgba(120,80,40,${a})`;
    ctx.fillRect(0, y, 256, 1);
  }
  // sparse fibre flecks
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = `rgba(100,60,25,${Math.random() * 0.18})`;
    ctx.fillRect(x, y, 1.2 + Math.random() * 3, 0.7);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* ============================================================================
 * Dice — rounded box, white with black pips
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
    ctx.arc(x * 256, y * 256, 22, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// Faces: pos + rot for a plane sitting just outside each cube face
// Box order matches +X, -X, +Y, -Y, +Z, -Z with values 3,4,1,6,2,5
const FACE_VALUES_LAYOUT = [
  { value: 1, pos: [0, 0.281, 0], rot: [-Math.PI / 2, 0, 0] },   // +Y top
  { value: 6, pos: [0, -0.281, 0], rot: [Math.PI / 2, 0, 0] },   // -Y bottom
  { value: 2, pos: [0, 0, 0.281], rot: [0, 0, 0] },              // +Z front
  { value: 5, pos: [0, 0, -0.281], rot: [0, Math.PI, 0] },       // -Z back
  { value: 3, pos: [0.281, 0, 0], rot: [0, Math.PI / 2, 0] },    // +X right
  { value: 4, pos: [-0.281, 0, 0], rot: [0, -Math.PI / 2, 0] },  // -X left
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
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 220)) : 0;
    const swipeY = throwVec ? Math.max(0, Math.min(1, throwVec.y / 220)) : 0.5;
    const lane = indexOffset === 0 ? -1 : 1;
    animRef.current = {
      active: true,
      startTime: performance.now() / 1000,
      duration: 1.45,
      startPos: new THREE.Vector3(lane * 1.0 + swipeX * 1.4, 3.8 + seedRand(1) * 0.4, -1.2),
      endPos: new THREE.Vector3(
        lane * 0.7 + swipeX * 1.1 + (seedRand(2) - 0.5) * 0.4,
        0.3,
        0.4 + swipeY * 0.7 + (seedRand(3) - 0.5) * 0.3
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
      <RoundedBox args={[0.55, 0.55, 0.55]} radius={0.07} smoothness={4} castShadow>
        <meshStandardMaterial color="#faf5e6" roughness={0.4} metalness={0.05} />
      </RoundedBox>
      {FACE_VALUES_LAYOUT.map((f) => (
        <mesh key={f.value} position={f.pos} rotation={f.rot}>
          <planeGeometry args={[0.45, 0.45]} />
          <meshStandardMaterial map={pipTextures[f.value]} transparent roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================================
 * Tile — pine board on a rod; flips forward when closed, revealing a letter
 * ========================================================================== */

function Tile({ value, x, closed, selected, onClick, woodTex }) {
  const groupRef = useRef();
  const angleRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : 0;
    const k = Math.min(delta * 9, 1);
    angleRef.current += (target - angleRef.current) * k;
    groupRef.current.rotation.x = angleRef.current;
  });

  const tileColor = selected ? '#f0c87a' : '#e6c794';
  const TILE_W = 0.45;
  const TILE_H = 0.85;
  const TILE_D = 0.08;

  return (
    <group ref={groupRef} position={[x, 0.08, -1.15]}>
      {/* Board */}
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(value);
        }}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial map={woodTex} color={tileColor} roughness={0.65} />
      </mesh>
      {/* Number on front (+Z face) */}
      <Text
        position={[0, TILE_H / 2, TILE_D / 2 + 0.001]}
        fontSize={0.42}
        color="#1a0d05"
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>
      {/* Letter on back (-Z face), rotated [π, 0, 0] so it reads correctly when tile is flat */}
      <Text
        position={[0, TILE_H / 2, -TILE_D / 2 - 0.001]}
        rotation={[Math.PI, 0, 0]}
        fontSize={0.5}
        color="#1a0d05"
        anchorX="center"
        anchorY="middle"
      >
        {LETTERS[value] || ''}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Box frame, felt floor, rod
 * ========================================================================== */

function BoxFrame({ feltTex, walnutTex }) {
  const BOX_W = 5.6;
  const BOX_D = 3.2;
  const WALL_H = 0.85;
  const WALL_THICK = 0.22;

  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.04, 0.01, BOX_D - WALL_THICK * 2 + 0.04]} />
        <meshStandardMaterial map={feltTex} color="#fbb8d8" roughness={0.95} />
      </mesh>
      {/* Floor base (under felt) */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[BOX_W, 0.12, BOX_D]} />
        <meshStandardMaterial map={walnutTex} roughness={0.6} />
      </mesh>
      {/* Side walls */}
      <mesh position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICK, WALL_H, BOX_D]} />
        <meshStandardMaterial map={walnutTex} roughness={0.6} />
      </mesh>
      <mesh position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WALL_THICK, WALL_H, BOX_D]} />
        <meshStandardMaterial map={walnutTex} roughness={0.6} />
      </mesh>
      {/* Back wall (full height) */}
      <mesh position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]} castShadow receiveShadow>
        <boxGeometry args={[BOX_W, WALL_H, WALL_THICK]} />
        <meshStandardMaterial map={walnutTex} roughness={0.6} />
      </mesh>
      {/* Front wall (lower so we can see in) */}
      <mesh position={[0, 0.25, BOX_D / 2 - WALL_THICK / 2]} castShadow receiveShadow>
        <boxGeometry args={[BOX_W, 0.5, WALL_THICK]} />
        <meshStandardMaterial map={walnutTex} roughness={0.6} />
      </mesh>
      {/* The rod the tiles pivot on */}
      <mesh position={[0, 0.08, -1.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial color="#3a1f0a" roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Scene
 * ========================================================================== */

function Scene({ openTiles, selected, dice, throwSeed, throwVec, onTileTap }) {
  const feltTex = useMemo(() => makeFeltTexture(), []);
  const walnutTex = useMemo(() => makeWalnutTexture(0), []);
  const mapleTex = useMemo(() => makeMapleTexture(1), []);

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

      <BoxFrame feltTex={feltTex} walnutTex={walnutTex} />

      {ALL_TILES.map((v, i) => {
        const x = (i - 4) * 0.55;
        return (
          <Tile
            key={v}
            value={v}
            x={x}
            closed={!openTiles.includes(v)}
            selected={selected.includes(v)}
            onClick={onTileTap}
            woodTex={mapleTex}
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
  const [phase, setPhase] = useState('idle'); // idle | rolling | rolled | over | won
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
    if (dy > 30 && Math.abs(dx) < dy * 1.5 && speed > 0.25) {
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

      {/* 3D scene */}
      <div
        className="overflow-hidden rounded-2xl shadow-lg"
        style={{
          height: 380,
          background: '#d3f3ea',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 7.5, 5.5], fov: 38 }}
          gl={{ antialias: true }}
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
        <p className="text-center text-xs text-neutral-500">Swipe down on the box to throw, or tap Roll.</p>
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
