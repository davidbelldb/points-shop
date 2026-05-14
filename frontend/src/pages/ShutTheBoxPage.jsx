import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* ============================================================================
 * Constants / defaults
 * ========================================================================== */

const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const DEFAULT_CONFIG = {
  felt_colour: '#15b8a6',
  frame_colour: '#0b8476',
  tile_colour: '#0b8476',
  ink_colour: '#faf5e6',
  dice_colour: '#e773b0',
  pip_colour: '#000000',
  hidden_message: 'I_MISS_U!',
  scattered_letters_back: '_______',
  scattered_letters_front: '_______',
};

const TABLE_COLOUR = '#d3f3ea';
// Poly Haven texture paths (drop files into frontend/public/textures/)
const WOOD_TEX_URL = '/textures/wood_table_worn_diffuse.jpg';
const VELVET_TEX_URL = '/textures/velour_velvet_diffuse.jpg';

function lettersFromMessage(msg, len = 9) {
  const m = (msg || '').padEnd(len, '_').slice(0, len);
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(m[i] === '_' ? '' : m[i]);
  }
  return out;
}

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
 * Textures — try Poly Haven JPGs, fall back to procedural
 * ========================================================================== */

function useOptionalTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        setTex(t);
      },
      undefined,
      () => setTex(null)
    );
  }, [url]);
  return tex;
}

function makeFeltTexture(baseColour) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColour;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = Math.random();
    ctx.fillStyle = v > 0.4
      ? `rgba(255,255,255,${0.03 + Math.random() * 0.07})`
      : `rgba(0,0,0,${0.02 + Math.random() * 0.05})`;
    ctx.fillRect(x, y, 1.3, 1.3);
  }
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 2 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
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
 * Dice
 * ========================================================================== */

const PIP_PATTERNS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.28, 0.72], [0.72, 0.28], [0.72, 0.72]],
  5: [[0.25, 0.25], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [0.75, 0.75]],
  6: [[0.27, 0.25], [0.27, 0.5], [0.27, 0.75], [0.73, 0.25], [0.73, 0.5], [0.73, 0.75]],
};

function makePipTexture(value, pipColour) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = pipColour;
  (PIP_PATTERNS[value] || []).forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x * 256, y * 256, 20, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

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

function Die({ value, throwSeed, throwVec, indexOffset, visible, diceColour, pipColour }) {
  const groupRef = useRef();
  const animRef = useRef({ active: false });

  const pipTextures = useMemo(() => ({
    1: makePipTexture(1, pipColour), 2: makePipTexture(2, pipColour),
    3: makePipTexture(3, pipColour), 4: makePipTexture(4, pipColour),
    5: makePipTexture(5, pipColour), 6: makePipTexture(6, pipColour),
  }), [pipColour]);

  useEffect(() => {
    if (!throwSeed || !visible) {
      animRef.current.active = false;
      return;
    }
    const seedRand = (i) => {
      const x = Math.sin(throwSeed * 9301 + i * 49297 + indexOffset * 233) * 43758;
      return x - Math.floor(x);
    };
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 200)) : 0;
    const lane = indexOffset === 0 ? -1 : 1;
    animRef.current = {
      active: true,
      startTime: performance.now() / 1000,
      duration: 1.45,
      startPos: new THREE.Vector3(lane * 0.8 - swipeX * 1.8, 3.5 + seedRand(1) * 0.4, -1.0),
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
        <meshStandardMaterial color={diceColour} roughness={0.45} metalness={0.05} />
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
 * Tile (in-box, hinged on rod)
 * ========================================================================== */

const TILE_W = 0.42;
const TILE_H = 0.75;
const TILE_D = 0.1;
const TILE_OPEN_ANGLE = -Math.PI / 7; // ~25° backward lean

function Tile({ value, x, closed, selected, onClick, tileColour, inkColour, letter, interactive, woodTex }) {
  const groupRef = useRef();
  const angleRef = useRef(TILE_OPEN_ANGLE);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : TILE_OPEN_ANGLE;
    const k = Math.min(delta * 9, 1);
    angleRef.current += (target - angleRef.current) * k;
    groupRef.current.rotation.x = angleRef.current;
  });

  return (
    <group ref={groupRef} position={[x, 0.08, -1.0]}>
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={interactive ? (e) => { e.stopPropagation(); onClick?.(value); } : undefined}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial map={woodTex || null} color={selected ? '#1aa999' : tileColour} roughness={0.6} />
      </mesh>
      <Text position={[0, TILE_H / 2, TILE_D / 2 + 0.001]} fontSize={0.38} color={inkColour} anchorX="center" anchorY="middle">
        {value}
      </Text>
      <Text position={[0, TILE_H / 2, -TILE_D / 2 - 0.001]} rotation={[Math.PI, 0, 0]} fontSize={0.42} color={inkColour} anchorX="center" anchorY="middle">
        {letter || ''}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Scattered loose letter tiles around the box
 * ========================================================================== */

function ScatteredTile({ letter, position, rotationY, tileColour, inkColour, woodTex }) {
  const W = 0.5;
  const H = 0.4;
  const D = 0.08;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, D / 2, 0]} castShadow rotation={[-Math.PI / 2, 0, 0]}>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial map={woodTex || null} color={tileColour} roughness={0.6} />
      </mesh>
      {letter ? (
        <Text
          position={[0, D + 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.24}
          color={inkColour}
          anchorX="center"
          anchorY="middle"
        >
          {letter}
        </Text>
      ) : null}
    </group>
  );
}

function ScatteredRow({ letters, baseZ, tileColour, inkColour, woodTex, seed }) {
  // Deterministic mild jitter per index so positions are stable per render
  const count = 7;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const t = (i - (count - 1) / 2) / ((count - 1) / 2); // -1..+1
        const x = t * 2.6;
        const jitter = Math.sin((seed + i) * 9.7);
        const z = baseZ + jitter * 0.18;
        const yRot = jitter * 0.4;
        return (
          <ScatteredTile
            key={i}
            letter={letters[i] || ''}
            position={[x + Math.cos((seed + i) * 4.3) * 0.05, 0, z]}
            rotationY={yRot}
            tileColour={tileColour}
            inkColour={inkColour}
            woodTex={woodTex}
          />
        );
      })}
    </>
  );
}

/* ============================================================================
 * 3D wooden "spacebar" buttons on the front of the box
 * ========================================================================== */

function SpacebarButton({ position, width, onClick, disabled, label, woodTex, frameColour, inkColour }) {
  const meshRef = useRef();
  const pressedRef = useRef(false);
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.04 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = position[1] + offsetY.current;
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerDown={(e) => { if (!disabled) { e.stopPropagation(); pressedRef.current = true; } }}
        onPointerUp={(e) => { if (!disabled) { e.stopPropagation(); pressedRef.current = false; onClick?.(); } }}
        onPointerLeave={() => { pressedRef.current = false; }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, 0.16, 0.5]} />
        <meshStandardMaterial map={woodTex || null} color={frameColour} roughness={0.55} />
      </mesh>
      <Text
        position={[0, 0.09, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.13}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
        material-opacity={disabled ? 0.35 : 1}
        material-transparent
      >
        {label}
      </Text>
    </group>
  );
}

const BOX_W = 5.6;
const BOX_D = 3.0;
const WALL_H = 0.65;
const WALL_THICK = 0.22;
const FRONT_LIP_Z = BOX_D / 2 + WALL_THICK / 2 + 0.18; // just in front of the front wall
const BUTTON_Y = 0.08; // sits on the table level

function ButtonBar({ phase, hasGame, onStart, onRoll, onClear, onClose, onNewGame, onReset, busy, canConfirm, selectedSum, diceSum, selectedCount, frameColour, inkColour }) {
  const woodTex = useOptionalTexture(WOOD_TEX_URL);
  // Decide what buttons to show in 3D
  const buttons = useMemo(() => {
    if (!hasGame) {
      return [{ label: 'Start game', onClick: onStart, width: 2.2, disabled: busy }];
    }
    if (phase === 'over' || phase === 'won') {
      return [
        { label: 'Reset', onClick: onReset, width: 1.0, disabled: busy },
        { label: 'New game', onClick: onNewGame, width: 1.6, disabled: busy },
      ];
    }
    if (phase === 'rolled') {
      return [
        { label: 'Clear', onClick: onClear, width: 1.0, disabled: selectedCount === 0 },
        { label: `Close ${selectedSum}/${diceSum}`, onClick: onClose, width: 1.8, disabled: !canConfirm || busy },
      ];
    }
    // idle game / rolling
    return [
      { label: 'Reset', onClick: onReset, width: 1.0, disabled: busy },
      { label: phase === 'rolling' ? 'Rolling…' : 'Roll', onClick: onRoll, width: 1.6, disabled: phase === 'rolling' || busy },
    ];
  }, [phase, hasGame, busy, canConfirm, selectedCount, selectedSum, diceSum]);

  // Position them centered, in front of the box
  const totalWidth = buttons.reduce((s, b) => s + b.width, 0) + (buttons.length - 1) * 0.08;
  let cursor = -totalWidth / 2;
  return (
    <group>
      {buttons.map((b, i) => {
        const x = cursor + b.width / 2;
        cursor += b.width + 0.08;
        return (
          <SpacebarButton
            key={i}
            position={[x, BUTTON_Y, FRONT_LIP_Z]}
            width={b.width}
            onClick={b.onClick}
            disabled={b.disabled}
            label={b.label}
            woodTex={woodTex}
            frameColour={frameColour}
            inkColour={inkColour}
          />
        );
      })}
    </group>
  );
}

/* ============================================================================
 * Box frame
 * ========================================================================== */

function BoxFrame({ feltTex, woodTex, frameColour, feltColour }) {
  const R = 0.05;
  const darkFrame = '#085f55';
  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.02, 0.01, BOX_D - WALL_THICK * 2 + 0.02]} />
        <meshStandardMaterial map={feltTex} color={feltColour} roughness={0.95} />
      </mesh>
      <RoundedBox args={[BOX_W, 0.12, BOX_D]} radius={R} smoothness={3} position={[0, -0.06, 0]} receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={darkFrame} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={frameColour} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={frameColour} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[BOX_W, WALL_H, WALL_THICK]} radius={R} smoothness={3} position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={frameColour} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[BOX_W, 0.4, WALL_THICK]} radius={R} smoothness={3} position={[0, 0.2, BOX_D / 2 - WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={frameColour} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0.08, -1.0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial color={darkFrame} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Scene (full layout — box, scattered tiles, dice, buttons)
 * ========================================================================== */

export function StbScene({
  openTiles = ALL_TILES,
  selected = [],
  dice = [null, null],
  throwSeed = 0,
  throwVec = null,
  onTileTap,
  config = DEFAULT_CONFIG,
  interactive = true,
  buttonBar = null,
}) {
  const feltTex = useMemo(() => makeFeltTexture(config.felt_colour), [config.felt_colour]);
  const woodTex = useOptionalTexture(WOOD_TEX_URL);
  const velvetTex = useOptionalTexture(VELVET_TEX_URL);
  const inboxLetters = useMemo(() => lettersFromMessage(config.hidden_message, 9), [config.hidden_message]);
  const backLetters = useMemo(() => lettersFromMessage(config.scattered_letters_back, 7), [config.scattered_letters_back]);
  const frontLetters = useMemo(() => lettersFromMessage(config.scattered_letters_front, 7), [config.scattered_letters_front]);

  // Prefer the Poly Haven velvet texture over the canvas-procedural felt when available
  const activeFeltTex = velvetTex || feltTex;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 8, 4]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />

      <BoxFrame
        feltTex={activeFeltTex}
        woodTex={woodTex}
        frameColour={config.frame_colour}
        feltColour={config.felt_colour}
      />

      {/* In-box hinged tiles */}
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
            tileColour={config.tile_colour}
            inkColour={config.ink_colour}
            letter={inboxLetters[v - 1]}
            interactive={interactive}
            woodTex={woodTex}
          />
        );
      })}

      {/* Scattered loose letter tiles on the table */}
      <ScatteredRow
        letters={backLetters}
        baseZ={-2.15}
        tileColour={config.tile_colour}
        inkColour={config.ink_colour}
        woodTex={woodTex}
        seed={1.3}
      />
      <ScatteredRow
        letters={frontLetters}
        baseZ={2.15}
        tileColour={config.tile_colour}
        inkColour={config.ink_colour}
        woodTex={woodTex}
        seed={4.7}
      />

      {/* Dice */}
      <Die
        value={dice[0] || 1}
        indexOffset={0}
        throwSeed={throwSeed}
        throwVec={throwVec}
        visible={!!dice[0]}
        diceColour={config.dice_colour}
        pipColour={config.pip_colour}
      />
      <Die
        value={dice[1] || 1}
        indexOffset={1}
        throwSeed={throwSeed}
        throwVec={throwVec}
        visible={!!dice[1]}
        diceColour={config.dice_colour}
        pipColour={config.pip_colour}
      />

      {/* 3D button bar */}
      {buttonBar}
    </>
  );
}

/* ============================================================================
 * Canvas shell — just the rounded container + canvas
 * ========================================================================== */

export function StbCanvasShell({ children, onPointerDown, onPointerUp }) {
  return (
    <div
      className="overflow-hidden rounded-2xl shadow-lg"
      style={{ background: TABLE_COLOUR }}
    >
      <div
        className="relative"
        style={{ aspectRatio: '7 / 5', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 7.5, 5.0], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      </div>
    </div>
  );
}

/* ============================================================================
 * Playable game component — used by both the page and the home embed
 * ========================================================================== */

export function ShutKatiesBoxGame({ showStatus = true }) {
  const { refresh: refreshBasket } = useBasket();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
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

  useEffect(() => {
    api.getStbConfig().then((c) => c && setConfig(c)).catch(() => {});
  }, []);

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
        setMessage(`You shut the box! +${res.credited_pts} pts.`);
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    } else {
      setPhase('idle');
    }
  }

  async function resetGame() {
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
    if (Math.abs(dx) > 40 && Math.abs(dy) < Math.abs(dx) * 0.8 && speed > 0.25) {
      triggerRoll({ x: dx, y: dy });
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
    );
  }

  const buttonBar = (
    <ButtonBar
      phase={phase}
      hasGame={!!game}
      onStart={newGame}
      onRoll={() => triggerRoll(null)}
      onClear={() => setSelected([])}
      onClose={confirmClose}
      onNewGame={newGame}
      onReset={resetGame}
      busy={busy}
      canConfirm={canConfirm}
      selectedSum={selectedSum}
      diceSum={diceSum}
      selectedCount={selected.length}
      frameColour={config.frame_colour}
      inkColour={config.ink_colour}
      // woodTex is loaded inside StbScene; ButtonBar gets it through that closure too via prop drilling
    />
  );

  return (
    <div className="space-y-3">
      <StbCanvasShell onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <StbScene
          openTiles={openTiles}
          selected={selected}
          dice={dice}
          throwSeed={throwSeed}
          throwVec={throwVec}
          onTileTap={tapTile}
          config={config}
          interactive
          buttonBar={buttonBar}
        />
      </StbCanvasShell>

      {showStatus && phase === 'idle' && game && (
        <p className="text-center text-xs text-neutral-500">Swipe right to roll.. it's all in the fingers.</p>
      )}

      {showStatus && (message || phase === 'rolled') && (
        <div className="rounded-xl bg-white border border-neutral-200 p-3 text-center text-sm">
          {phase === 'rolled' && !message && (
            <>You rolled <strong>{diceSum}</strong>. Tap open tiles that sum to {diceSum}.{' '}
              <span className="text-neutral-500">Selected: {selectedSum}</span>
            </>
          )}
          {message && (
            <span className={phase === 'won' ? 'font-semibold text-teal-700' : phase === 'over' ? 'font-semibold text-pink-600' : ''}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * Page wrapper
 * ========================================================================== */

export default function ShutTheBoxPage() {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Shut Katie's Box</h1>
        <span className="w-10" />
      </div>
      <ShutKatiesBoxGame />
    </div>
  );
}
