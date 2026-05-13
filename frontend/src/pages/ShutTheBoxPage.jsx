import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
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
 * Dice — opaque ivory cube with pip textures, animated tumble + parabolic arc
 * ========================================================================== */

// Pip positions per face value, normalised to [0,1] of the face
const PIP_PATTERNS = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.25, 0.75], [0.75, 0.25], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.25, 0.5], [0.25, 0.75], [0.75, 0.25], [0.75, 0.5], [0.75, 0.75]],
};

function makeFaceTexture(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // ivory background
  ctx.fillStyle = '#faf5e6';
  ctx.fillRect(0, 0, 256, 256);
  // subtle inner bevel
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(60,40,20,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // pips
  ctx.fillStyle = '#1c0d05';
  (PIP_PATTERNS[value] || []).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * 256, y * 256, 22, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Material order for boxGeometry: +X, -X, +Y, -Y, +Z, -Z
// Standard western die: opposite faces sum to 7. Assign:
// +Y = 1, -Y = 6, +X = 3, -X = 4, +Z = 2, -Z = 5
const FACE_VALUES = [3, 4, 1, 6, 2, 5];

// Target quaternions to land each value face-up
const FACE_QUATS = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)),
  2: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
  5: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
  3: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
  4: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)),
};

function Die({ value, throwSeed, throwVec, indexOffset, visible }) {
  const meshRef = useRef();
  const animRef = useRef({ active: false });

  // Build the 6 textured materials once
  const materials = useMemo(
    () =>
      FACE_VALUES.map((v) =>
        new THREE.MeshStandardMaterial({
          map: makeFaceTexture(v),
          color: '#ffffff',
          roughness: 0.45,
          metalness: 0.05,
        })
      ),
    []
  );

  // Set up a new throw whenever throwSeed bumps
  useEffect(() => {
    if (!throwSeed || !visible) {
      animRef.current.active = false;
      return;
    }
    const seedRand = (i) => {
      const x = Math.sin(throwSeed * 9301 + i * 49297 + indexOffset * 233) * 43758;
      return x - Math.floor(x);
    };
    // Swipe vector influences the lateral landing position
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 220)) : 0;
    const swipeY = throwVec ? Math.max(0, Math.min(1, throwVec.y / 220)) : 0.5;
    const lane = indexOffset === 0 ? -1 : 1;
    animRef.current = {
      active: true,
      startTime: performance.now() / 1000,
      duration: 1.45,
      startPos: new THREE.Vector3(lane * 1.4 + swipeX * 1.8, 4.5 + seedRand(1) * 0.6, -1.6),
      endPos: new THREE.Vector3(
        lane * 0.9 + swipeX * 1.5 + (seedRand(2) - 0.5) * 0.6,
        0.32,
        0.4 + swipeY * 0.9 + (seedRand(3) - 0.5) * 0.4
      ),
      spinAxis: new THREE.Vector3(seedRand(4) - 0.5, seedRand(5) - 0.5, seedRand(6) - 0.5).normalize(),
      spinSpeed: 14 + seedRand(7) * 6,
      targetQuat: FACE_QUATS[value].clone(),
      midQuat: new THREE.Quaternion(),
    };
    // place at start
    if (meshRef.current) {
      meshRef.current.position.copy(animRef.current.startPos);
      meshRef.current.quaternion.identity();
    }
  }, [throwSeed, value, indexOffset, visible, throwVec]);

  useFrame((state) => {
    const a = animRef.current;
    if (!a.active || !meshRef.current) return;
    const elapsed = state.clock.elapsedTime - a.startTime;
    const t = Math.min(elapsed / a.duration, 1);

    if (t < 0.78) {
      // tumble + parabolic arc from start to end
      const k = t / 0.78;
      meshRef.current.position.x = THREE.MathUtils.lerp(a.startPos.x, a.endPos.x, k);
      meshRef.current.position.z = THREE.MathUtils.lerp(a.startPos.z, a.endPos.z, k);
      meshRef.current.position.y =
        THREE.MathUtils.lerp(a.startPos.y, a.endPos.y, k) + Math.sin(k * Math.PI) * 1.4;
      meshRef.current.quaternion.setFromAxisAngle(a.spinAxis, elapsed * a.spinSpeed);
      a.midQuat.copy(meshRef.current.quaternion);
    } else if (t < 1) {
      // slerp into the target orientation, settle position
      const k = (t - 0.78) / 0.22;
      const ease = 1 - Math.pow(1 - k, 3);
      meshRef.current.position.copy(a.endPos);
      meshRef.current.quaternion.slerpQuaternions(a.midQuat, a.targetQuat, ease);
    } else {
      meshRef.current.position.copy(a.endPos);
      meshRef.current.quaternion.copy(a.targetQuat);
      a.active = false;
    }
  });

  if (!visible) return null;
  return (
    <mesh ref={meshRef} castShadow material={materials}>
      <boxGeometry args={[0.55, 0.55, 0.55]} />
    </mesh>
  );
}

/* ============================================================================
 * Tile — wooden board on a rod; flips forward when closed, revealing a letter
 * ========================================================================== */

function Tile({ value, x, closed, selected, onClick }) {
  const groupRef = useRef();
  const angleRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : 0;
    const speed = Math.min(delta * 9, 1);
    angleRef.current += (target - angleRef.current) * speed;
    groupRef.current.rotation.x = angleRef.current;
  });

  const numberColor = selected ? '#d62b85' : '#3a1f0a';
  const tileColor = selected ? '#c89465' : '#8b5a2b';

  return (
    <group ref={groupRef} position={[x, 0.08, -1.4]}>
      {/* The board itself, anchored so its bottom sits at the rod */}
      <mesh
        position={[0, 0.5, 0]}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(value);
        }}
      >
        <boxGeometry args={[0.78, 1.0, 0.06]} />
        <meshStandardMaterial color={tileColor} roughness={0.7} />
      </mesh>
      {/* Front face: number */}
      <Text
        position={[0, 0.5, 0.034]}
        fontSize={0.48}
        color={numberColor}
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>
      {/* Back face: letter spelling YOU SUCK! */}
      <Text
        position={[0, 0.5, -0.034]}
        rotation={[0, Math.PI, 0]}
        fontSize={0.52}
        color="#a32c6e"
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

function BoxFrame() {
  return (
    <group>
      {/* Felt floor — pink fabric look */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[6.8, 0.06, 3.2]} />
        <meshStandardMaterial color="#d83d85" roughness={0.95} />
      </mesh>
      {/* Walls */}
      <mesh position={[-3.55, 0.55, 0]} receiveShadow>
        <boxGeometry args={[0.3, 1.1, 3.4]} />
        <meshStandardMaterial color="#6e4523" roughness={0.65} />
      </mesh>
      <mesh position={[3.55, 0.55, 0]} receiveShadow>
        <boxGeometry args={[0.3, 1.1, 3.4]} />
        <meshStandardMaterial color="#6e4523" roughness={0.65} />
      </mesh>
      <mesh position={[0, 0.55, -1.7]} receiveShadow>
        <boxGeometry args={[7.1, 1.1, 0.3]} />
        <meshStandardMaterial color="#6e4523" roughness={0.65} />
      </mesh>
      {/* Front wall is shorter so we can see in */}
      <mesh position={[0, 0.22, 1.7]} receiveShadow>
        <boxGeometry args={[7.1, 0.45, 0.3]} />
        <meshStandardMaterial color="#6e4523" roughness={0.65} />
      </mesh>
      {/* Outer rim trim */}
      <mesh position={[0, 1.12, -1.7]}>
        <boxGeometry args={[7.1, 0.05, 0.3]} />
        <meshStandardMaterial color="#3a1f0a" roughness={0.6} />
      </mesh>
      <mesh position={[-3.55, 1.12, 0]}>
        <boxGeometry args={[0.3, 0.05, 3.4]} />
        <meshStandardMaterial color="#3a1f0a" roughness={0.6} />
      </mesh>
      <mesh position={[3.55, 1.12, 0]}>
        <boxGeometry args={[0.3, 0.05, 3.4]} />
        <meshStandardMaterial color="#3a1f0a" roughness={0.6} />
      </mesh>
      {/* Wooden rod the tiles pivot on */}
      <mesh position={[0, 0.09, -1.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 6.2, 16]} />
        <meshStandardMaterial color="#3a1f0a" roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Scene
 * ========================================================================== */

function Scene({ openTiles, selected, dice, throwSeed, throwVec, onTileTap }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-5, 4, -2]} intensity={0.35} />

      <BoxFrame />

      {ALL_TILES.map((v, i) => {
        const x = (i - 4) * 0.7;
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
    // Wait for dice to land before declaring outcome
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

  /* --- Swipe-to-throw detection on the canvas wrapper --- */
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
    // Require a downward-ish swipe with enough length and speed
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
        <h1 className="text-lg font-semibold tracking-tight">Shut the Box</h1>
        {game ? (
          <button onClick={resetGame} disabled={busy} className="text-sm font-medium text-neutral-500 disabled:opacity-30">Reset</button>
        ) : <span className="w-10" />}
      </div>

      {/* 3D scene */}
      <div
        className="overflow-hidden rounded-2xl shadow-lg"
        style={{
          height: 380,
          background: 'linear-gradient(180deg, #f6e4cf 0%, #e7c89a 100%)',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 4.2, 5.6], fov: 32 }}
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
