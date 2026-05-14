import { createContext, useContext, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
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
  scattered_letters_back: '________',
  scattered_letters_front: '________',
};

const TABLE_COLOUR = '#d3f3ea';
const WOOD_FALLBACK = '#8b5a2b';      // saddle-brown — when wood JPG missing
const WOOD_DARK_FALLBACK = '#3a2316'; // very dark walnut — for base / rod
const FELT_FALLBACK = '#15b8a6';      // teal — when velvet JPG missing

// Tints multiplied into the diffuse texture so the pale Poly Haven JPGs read as wood / felt.
// White (#fff) means "show the texture untouched". A darker / coloured tint enriches the result.
const WOOD_TINT = '#9a6a3c';          // warm tan-brown — applied over the wood texture
const WOOD_DARK_TINT = '#5a3a1f';     // darker tan — for the base under the felt
const VELVET_TINT = '#ffffff';        // velour velvet's natural red comes through

const WOOD_TEX_URL = '/textures/wood_table_worn_diffuse.jpg';
const VELVET_TEX_URL = '/textures/velour_velvet_diffuse.jpg';

function lettersFromMessage(msg, len) {
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
 * Textures
 * ========================================================================== */

// Load a texture once per call. Each consumer gets its own THREE.Texture so the GPU upload
// is independent — avoids cloning headaches where a cloned texture renders white.
function useOptionalTexture(url, repeatX = 1, repeatY = 1) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    let active = true;
    new THREE.TextureLoader().load(
      url,
      (t) => {
        if (!active) return;
        // JPGs are stored sRGB — without this they render washed-out.
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX, repeatY);
        t.anisotropy = 4;
        t.needsUpdate = true;
        setTex(t);
      },
      undefined,
      (err) => {
        console.warn('[stb] texture failed to load', url, err?.message || err);
        if (active) setTex(null);
      }
    );
    return () => { active = false; };
  }, [url, repeatX, repeatY]);
  return tex;
}

// Single-shared-texture context so the whole scene uses ONE wood + ONE velvet upload
// instead of duplicating heavy 12 MB JPGs across every mesh.
const StbTexCtx = createContext({ woodTex: null, velvetTex: null });
function useStbTextures() { return useContext(StbTexCtx); }

/* ============================================================================
 * Dice — pip planes + Rapier physics
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

// Face layout: +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4. Pip-plane local positions/rotations:
const FACE_PIPS = [
  { value: 1, pos: [0, PIP_OFFSET, 0], rot: [-Math.PI / 2, 0, 0] },
  { value: 6, pos: [0, -PIP_OFFSET, 0], rot: [Math.PI / 2, 0, 0] },
  { value: 2, pos: [0, 0, PIP_OFFSET], rot: [0, 0, 0] },
  { value: 5, pos: [0, 0, -PIP_OFFSET], rot: [0, Math.PI, 0] },
  { value: 3, pos: [PIP_OFFSET, 0, 0], rot: [0, Math.PI / 2, 0] },
  { value: 4, pos: [-PIP_OFFSET, 0, 0], rot: [0, -Math.PI / 2, 0] },
];

// Face normals in local space — used to read which face is up after settling
const FACE_NORMALS = [
  { v: 1, n: new THREE.Vector3(0, 1, 0) },
  { v: 6, n: new THREE.Vector3(0, -1, 0) },
  { v: 3, n: new THREE.Vector3(1, 0, 0) },
  { v: 4, n: new THREE.Vector3(-1, 0, 0) },
  { v: 2, n: new THREE.Vector3(0, 0, 1) },
  { v: 5, n: new THREE.Vector3(0, 0, -1) },
];

function readDieFace(quaternion) {
  let best = { v: 1, y: -Infinity };
  for (const f of FACE_NORMALS) {
    const v = f.n.clone().applyQuaternion(quaternion);
    if (v.y > best.y) best = { v: f.v, y: v.y };
  }
  return best.v;
}

function PhysicsDie({ throwSeed, throwVec, indexOffset, onSettled, diceColour, pipColour, visible }) {
  const bodyRef = useRef();
  const restFramesRef = useRef(0);
  const settledRef = useRef(false);

  const pipTextures = useMemo(() => ({
    1: makePipTexture(1, pipColour), 2: makePipTexture(2, pipColour),
    3: makePipTexture(3, pipColour), 4: makePipTexture(4, pipColour),
    5: makePipTexture(5, pipColour), 6: makePipTexture(6, pipColour),
  }), [pipColour]);

  // Apply a fresh throw whenever throwSeed bumps
  useEffect(() => {
    if (!bodyRef.current || !throwSeed) return;
    const seedRand = (i) => {
      const x = Math.sin(throwSeed * 9301 + i * 49297 + indexOffset * 233) * 43758;
      return x - Math.floor(x);
    };
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 200)) : 0;
    const lane = indexOffset === 0 ? -1 : 1;

    // Place die above the box, biased by swipe + lane
    const startX = lane * 0.6 - swipeX * 1.4;
    const startY = 2.2 + seedRand(1) * 0.3;
    const startZ = 1.1 + seedRand(2) * 0.3;
    bodyRef.current.setTranslation({ x: startX, y: startY, z: startZ }, true);
    bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);

    // Throw into the box: small +X bias from swipe, downward, away from camera (-Z)
    bodyRef.current.setLinvel({
      x: swipeX * 3 + (seedRand(3) - 0.5) * 1.5,
      y: -2.5 - seedRand(4) * 1.5,
      z: -3.5 - seedRand(5) * 1.5,
    }, true);
    bodyRef.current.setAngvel({
      x: (seedRand(6) - 0.5) * 18,
      y: (seedRand(7) - 0.5) * 18,
      z: (seedRand(8) - 0.5) * 18,
    }, true);

    settledRef.current = false;
    restFramesRef.current = 0;
  }, [throwSeed, throwVec, indexOffset]);

  // Settling detection + face-value reading
  useFrame(() => {
    if (settledRef.current || !bodyRef.current) return;
    const body = bodyRef.current;
    const lv = body.linvel();
    const av = body.angvel();
    const linSq = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
    const angSq = av.x * av.x + av.y * av.y + av.z * av.z;
    if (linSq < 0.005 && angSq < 0.005) {
      restFramesRef.current += 1;
      if (restFramesRef.current > 25) {
        const r = body.rotation();
        const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const value = readDieFace(q);
        settledRef.current = true;
        onSettled?.(indexOffset, value);
      }
    } else {
      restFramesRef.current = 0;
    }
  });

  if (!visible) return null;

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      restitution={0.35}
      friction={0.55}
      linearDamping={0.2}
      angularDamping={0.4}
      ccd
    >
      <CuboidCollider args={[DIE_HALF, DIE_HALF, DIE_HALF]} />
      <RoundedBox args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} radius={0.05} smoothness={4} castShadow>
        <meshStandardMaterial color={diceColour} roughness={0.45} metalness={0.05} />
      </RoundedBox>
      {FACE_PIPS.map((f) => (
        <mesh key={f.value} position={f.pos} rotation={f.rot}>
          <planeGeometry args={[PIP_PLANE, PIP_PLANE]} />
          <meshStandardMaterial map={pipTextures[f.value]} transparent roughness={0.5} />
        </mesh>
      ))}
    </RigidBody>
  );
}

/* ============================================================================
 * Tile (in-box, hinged on rod)
 * ========================================================================== */

const TILE_W = 0.42;
const TILE_H = 0.75;
const TILE_D = 0.1;
const TILE_OPEN_ANGLE = -Math.PI / 7;

function Tile({ value, x, closed, selected, onClick, inkColour, letter, interactive }) {
  const { woodTex } = useStbTextures();
  const groupRef = useRef();
  const angleRef = useRef(TILE_OPEN_ANGLE);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : TILE_OPEN_ANGLE;
    const k = Math.min(delta * 9, 1);
    angleRef.current += (target - angleRef.current) * k;
    groupRef.current.rotation.x = angleRef.current;
  });

  // Selected tiles glow with a warm highlight; otherwise wood-tinted texture or solid wood fallback
  const baseColour = woodTex ? WOOD_TINT : WOOD_FALLBACK;
  const tintColour = selected ? '#ffd58a' : baseColour;

  return (
    <group ref={groupRef} position={[x, 0.08, -1.0]}>
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={interactive ? (e) => { e.stopPropagation(); onClick?.(value); } : undefined}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial map={woodTex || null} color={tintColour} roughness={0.6} />
      </mesh>
      <Text position={[0, TILE_H / 2, TILE_D / 2 + 0.002]} fontSize={0.38} color={inkColour} anchorX="center" anchorY="middle">
        {value}
      </Text>
      <Text position={[0, TILE_H / 2, -TILE_D / 2 - 0.002]} rotation={[Math.PI, 0, 0]} fontSize={0.42} color={inkColour} anchorX="center" anchorY="middle">
        {letter || ''}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Scattered loose letter tiles (table — 8 back, 8 front)
 * ========================================================================== */

function ScatteredTile({ letter, position, rotationY, inkColour }) {
  const { woodTex } = useStbTextures();
  const W = 0.7;
  const H = 0.6;
  const D = 0.12;
  const baseColour = woodTex ? WOOD_TINT : WOOD_FALLBACK;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, D / 2, 0]} castShadow>
        <boxGeometry args={[W, D, H]} />
        <meshStandardMaterial map={woodTex || null} color={baseColour} roughness={0.6} />
      </mesh>
      {letter ? (
        <Text
          position={[0, D + 0.005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.38}
          color={inkColour}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000"
        >
          {letter}
        </Text>
      ) : null}
    </group>
  );
}

function ScatteredRow({ letters, baseZ, inkColour, seed }) {
  const count = 8;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const t = (i - (count - 1) / 2) / ((count - 1) / 2);
        const x = t * 3.7;
        const jitter = Math.sin((seed + i) * 9.7);
        const z = baseZ + jitter * 0.25;
        const yRot = jitter * 0.45;
        return (
          <ScatteredTile
            key={i}
            letter={letters[i] || ''}
            position={[x + Math.cos((seed + i) * 4.3) * 0.08, 0, z]}
            rotationY={yRot}
            inkColour={inkColour}
          />
        );
      })}
    </>
  );
}

/* ============================================================================
 * 3D wooden "spacebar" buttons
 * ========================================================================== */

function SpacebarButton({ position, width, onClick, disabled, label, inkColour }) {
  const { woodTex } = useStbTextures();
  const meshRef = useRef();
  const pressedRef = useRef(false);
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.04 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = offsetY.current;
  });

  const baseColour = woodTex ? WOOD_TINT : WOOD_FALLBACK;

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
        <boxGeometry args={[width, 0.18, 0.55]} />
        <meshStandardMaterial map={woodTex || null} color={baseColour} roughness={0.55} />
      </mesh>
      {/* Label rendered above the button top face, depth-test disabled so it can't be hidden behind the wood */}
      <Text
        position={[0, 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor={disabled ? '#555' : '#000'}
        fillOpacity={disabled ? 0.45 : 1}
        renderOrder={10}
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
const FRONT_LIP_Z = BOX_D / 2 + WALL_THICK / 2 + 0.35;
const BUTTON_Y = 0.09;

function ButtonBar({ phase, hasGame, onStart, onRoll, onClear, onClose, onNewGame, onReset, busy, canConfirm, selectedSum, diceSum, selectedCount, inkColour }) {
  const buttons = useMemo(() => {
    if (!hasGame) {
      return [{ label: 'Start game', onClick: onStart, width: 2.4, disabled: busy }];
    }
    if (phase === 'over' || phase === 'won') {
      return [
        { label: 'Reset', onClick: onReset, width: 1.1, disabled: busy },
        { label: 'New game', onClick: onNewGame, width: 1.7, disabled: busy },
      ];
    }
    if (phase === 'rolled') {
      return [
        { label: 'Clear', onClick: onClear, width: 1.1, disabled: selectedCount === 0 },
        { label: `Close ${selectedSum}/${diceSum}`, onClick: onClose, width: 1.9, disabled: !canConfirm || busy },
      ];
    }
    return [
      { label: 'Reset', onClick: onReset, width: 1.1, disabled: busy },
      { label: phase === 'rolling' ? 'Rolling…' : 'Roll dice', onClick: onRoll, width: 1.7, disabled: phase === 'rolling' || busy },
    ];
  }, [phase, hasGame, busy, canConfirm, selectedCount, selectedSum, diceSum]);

  const totalWidth = buttons.reduce((s, b) => s + b.width, 0) + (buttons.length - 1) * 0.12;
  let cursor = -totalWidth / 2;
  return (
    <group>
      {buttons.map((b, i) => {
        const x = cursor + b.width / 2;
        cursor += b.width + 0.12;
        return (
          <SpacebarButton
            key={i}
            position={[x, BUTTON_Y, FRONT_LIP_Z]}
            width={b.width}
            onClick={b.onClick}
            disabled={b.disabled}
            label={b.label}
            inkColour={inkColour}
          />
        );
      })}
    </group>
  );
}

/* ============================================================================
 * Box frame + colliders for physics
 * ========================================================================== */

function BoxFrame() {
  const { woodTex, velvetTex } = useStbTextures();
  const R = 0.05;
  const woodCol = woodTex ? WOOD_TINT : WOOD_FALLBACK;
  const woodDarkCol = woodTex ? WOOD_DARK_TINT : WOOD_DARK_FALLBACK;
  const feltCol = velvetTex ? VELVET_TINT : FELT_FALLBACK;

  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.02, 0.01, BOX_D - WALL_THICK * 2 + 0.02]} />
        <meshStandardMaterial map={velvetTex || null} color={feltCol} roughness={0.95} />
      </mesh>
      {/* Floor base — wood textured */}
      <RoundedBox args={[BOX_W, 0.12, BOX_D]} radius={R} smoothness={3} position={[0, -0.06, 0]} receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={woodDarkCol} roughness={0.6} />
      </RoundedBox>
      {/* Walls */}
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={woodCol} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={woodCol} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[BOX_W, WALL_H, WALL_THICK]} radius={R} smoothness={3} position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={woodCol} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[BOX_W, 0.4, WALL_THICK]} radius={R} smoothness={3} position={[0, 0.2, BOX_D / 2 - WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} color={woodCol} roughness={0.6} />
      </RoundedBox>
      {/* Rod */}
      <mesh position={[0, 0.08, -1.0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial color={WOOD_DARK_FALLBACK} roughness={0.5} />
      </mesh>
    </group>
  );
}

// Static colliders matching the box interior — keeps dice contained
function BoxColliders() {
  const innerW = BOX_W - WALL_THICK * 2;
  const innerD = BOX_D - WALL_THICK * 2;
  const tallH = 2.0;     // taller than visible walls so fast dice don't escape
  const halfTall = tallH / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Floor */}
      <CuboidCollider args={[BOX_W / 2, 0.05, BOX_D / 2]} position={[0, 0.005, 0]} restitution={0.2} friction={0.7} />
      {/* Back wall */}
      <CuboidCollider args={[innerW / 2, halfTall, WALL_THICK / 2]} position={[0, halfTall, -BOX_D / 2 + WALL_THICK / 2]} restitution={0.35} friction={0.4} />
      {/* Front wall (full collision height even though visible part is short) */}
      <CuboidCollider args={[innerW / 2, halfTall, WALL_THICK / 2]} position={[0, halfTall, BOX_D / 2 - WALL_THICK / 2]} restitution={0.35} friction={0.4} />
      {/* Left wall */}
      <CuboidCollider args={[WALL_THICK / 2, halfTall, innerD / 2]} position={[-BOX_W / 2 + WALL_THICK / 2, halfTall, 0]} restitution={0.35} friction={0.4} />
      {/* Right wall */}
      <CuboidCollider args={[WALL_THICK / 2, halfTall, innerD / 2]} position={[BOX_W / 2 - WALL_THICK / 2, halfTall, 0]} restitution={0.35} friction={0.4} />
      {/* Rod — short cuboid approximating the cylinder, blocks dice from rolling under the tiles */}
      <CuboidCollider args={[innerW / 2, 0.03, 0.03]} position={[0, 0.08, -1.0]} restitution={0.2} friction={0.5} />
    </RigidBody>
  );
}

/* ============================================================================
 * Scene
 * ========================================================================== */

export function StbScene({
  openTiles = ALL_TILES,
  selected = [],
  dice = [null, null],
  diceVisible = false,
  throwSeed = 0,
  throwVec = null,
  onTileTap,
  onDieSettled,
  config = DEFAULT_CONFIG,
  interactive = true,
  buttonBar = null,
}) {
  // One wood + one velvet texture for the whole scene — heavy 12 MB JPGs uploaded once
  const woodTex = useOptionalTexture(WOOD_TEX_URL, 1.5, 1);
  const velvetTex = useOptionalTexture(VELVET_TEX_URL, 3, 1.5);
  const inboxLetters = useMemo(() => lettersFromMessage(config.hidden_message, 9), [config.hidden_message]);
  const backLetters = useMemo(() => lettersFromMessage(config.scattered_letters_back, 8), [config.scattered_letters_back]);
  const frontLetters = useMemo(() => lettersFromMessage(config.scattered_letters_front, 8), [config.scattered_letters_front]);

  return (
    <StbTexCtx.Provider value={{ woodTex, velvetTex }}>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 8, 4]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />

      <Physics gravity={[0, -22, 0]}>
        <BoxFrame />
        <BoxColliders />

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
              inkColour={config.ink_colour}
              letter={inboxLetters[v - 1]}
              interactive={interactive}
            />
          );
        })}

        <ScatteredRow letters={backLetters} baseZ={-3.0} inkColour={config.ink_colour} seed={1.3} />
        <ScatteredRow letters={frontLetters} baseZ={3.0} inkColour={config.ink_colour} seed={4.7} />

        <PhysicsDie
          throwSeed={throwSeed}
          throwVec={throwVec}
          indexOffset={0}
          onSettled={onDieSettled}
          diceColour={config.dice_colour}
          pipColour={config.pip_colour}
          visible={diceVisible}
        />
        <PhysicsDie
          throwSeed={throwSeed}
          throwVec={throwVec}
          indexOffset={1}
          onSettled={onDieSettled}
          diceColour={config.dice_colour}
          pipColour={config.pip_colour}
          visible={diceVisible}
        />

        {buttonBar}
      </Physics>
    </StbTexCtx.Provider>
  );
}

/* ============================================================================
 * Canvas shell
 * ========================================================================== */

export function StbCanvasShell({ children, onPointerDown, onPointerUp }) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-lg" style={{ background: TABLE_COLOUR }}>
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
 * Playable game
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
  const settledRef = useRef([null, null]);

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
      settledRef.current = [null, null];
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function onDieSettled(index, value) {
    if (settledRef.current[index] !== null) return;
    settledRef.current = settledRef.current.slice();
    settledRef.current[index] = value;
    if (settledRef.current[0] !== null && settledRef.current[1] !== null) {
      const d1 = settledRef.current[0];
      const d2 = settledRef.current[1];
      setDice([d1, d2]);
      const target = d1 + d2;
      if (!hasValidClose(openTiles, target)) {
        setPhase('over');
        setMessage(`No valid combination for ${target}. Game over!`);
        api.stbEnd({ game_id: game?.id, result: 'loss', final_tiles_open: openTiles }).catch(() => {});
      } else {
        setPhase('rolled');
      }
    }
  }

  function triggerRoll(swipeVec = null) {
    if (!game || phase === 'rolled' || phase === 'rolling' || busy) return;
    setMessage('');
    setPhase('rolling');
    setDice([null, null]);
    settledRef.current = [null, null];
    setThrowVec(swipeVec);
    setThrowSeed((s) => s + 1);
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
    settledRef.current = [null, null];
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
    settledRef.current = [null, null];
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
      inkColour={config.ink_colour}
    />
  );

  const diceVisible = phase === 'rolling' || phase === 'rolled' || phase === 'over' || phase === 'won';

  return (
    <div className="space-y-3">
      <StbCanvasShell onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <StbScene
          openTiles={openTiles}
          selected={selected}
          dice={dice}
          diceVisible={diceVisible}
          throwSeed={throwSeed}
          throwVec={throwVec}
          onTileTap={tapTile}
          onDieSettled={onDieSettled}
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
