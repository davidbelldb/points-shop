import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, RoundedBox, useTexture, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* ============================================================================
 * Constants / defaults
 * ========================================================================== */

const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const HIGH_TILES = [7, 8, 9, 10, 11, 12, 13, 14, 15];

const DEFAULT_CONFIG = {
  felt_colour: '#15b8a6',
  frame_colour: '#0b8476',
  tile_colour: '#0b8476',
  ink_colour: '#faf5e6',
  dice_colour: '#e773b0',
  pip_colour: '#000000',
  table_colour: '#d3f3ea',
  hidden_message: 'I_MISS_YOU_SO_MUCH!!',
};

const GRANITE_TEX_URL = '/textures/granite.png?v=1';
const TEAL_WOOD_TEX_URL = '/textures/teal_wood.jpg?v=1';
const VELVET_TEX_URL = '/textures/velour_velvet_diff.jpg?v=3';
const TWIRL_URL = '/twirl.glb';

// Box geometry constants — wider to fit 15 tiles
const BOX_W = 7.4;
const BOX_D = 3.0;
const WALL_H = 0.65;
const WALL_THICK = 0.22;
const TILE_W = 0.36;
const TILE_H = 0.75;
const TILE_D = 0.1;
const TILE_OPEN_ANGLE = -Math.PI / 5.5;
const TILE_SPACING = 0.47;          // centre-to-centre spacing for 15 tiles
const TILE_START_X = -((15 - 1) / 2) * TILE_SPACING; // -3.29

// Cabinet geometry
const CAB_PANEL_W = BOX_W + 0.4;
const CAB_PANEL_H = 1.6;
const CAB_PANEL_D = 0.18;
const CAB_SURFACE_D = BOX_D + 1.0;
const CAB_SURFACE_H = 0.12;
const SURFACE_Y = -0.12;  // top of surface (box sits at y=0 on the box floor, so cabinet top at y≈-0.12)

/* ============================================================================
 * Texture loader hook
 * ========================================================================== */

function useStb15Textures() {
  const [graniteTex, tealWoodTex, velvetTex] = useTexture([GRANITE_TEX_URL, TEAL_WOOD_TEX_URL, VELVET_TEX_URL]);

  [graniteTex, tealWoodTex, velvetTex].forEach((tex) => {
    if (tex && tex.colorSpace !== THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
    }
  });

  if (graniteTex) {
    graniteTex.repeat.set(3, 2);
  }
  if (tealWoodTex) {
    tealWoodTex.repeat.set(2, 1.5);
  }

  return { graniteTex, tealWoodTex, velvetTex };
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function lettersFromMessage(msg, len) {
  const m = (msg || '').padEnd(len, '_').slice(0, len);
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(m[i] === '_' ? '' : m[i]);
  }
  return out;
}

function pickTileMessage(config) {
  const msgs = Array.isArray(config?.tile_messages)
    ? config.tile_messages.filter((m) => m.active && m.message)
    : [];
  if (msgs.length > 0) return msgs[Math.floor(Math.random() * msgs.length)].message;
  return config?.hidden_message || 'I_MISS_YOU_SO_MUCH!!';
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
 * Dice pip helpers
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

const FACE_PIPS = [
  { value: 1, pos: [0, PIP_OFFSET, 0], rot: [-Math.PI / 2, 0, 0] },
  { value: 6, pos: [0, -PIP_OFFSET, 0], rot: [Math.PI / 2, 0, 0] },
  { value: 2, pos: [0, 0, PIP_OFFSET], rot: [0, 0, 0] },
  { value: 5, pos: [0, 0, -PIP_OFFSET], rot: [0, Math.PI, 0] },
  { value: 3, pos: [PIP_OFFSET, 0, 0], rot: [0, Math.PI / 2, 0] },
  { value: 4, pos: [-PIP_OFFSET, 0, 0], rot: [0, -Math.PI / 2, 0] },
];

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

/* ============================================================================
 * Physics die
 * ========================================================================== */

function PhysicsDie({ throwSeed, throwVec, indexOffset, onSettled, diceColour, pipColour, palettes, visible }) {
  const bodyRef = useRef();
  const restFramesRef = useRef(0);
  const settledRef = useRef(false);
  const [activeBody, setActiveBody] = useState(diceColour);
  const [activePip, setActivePip] = useState(pipColour);

  useEffect(() => {
    if (!throwSeed) return;
    if (palettes && palettes.length > 0) {
      const pick = palettes[Math.floor(Math.random() * palettes.length)];
      setActiveBody(pick.body);
      setActivePip(pick.pip);
    } else {
      setActiveBody(diceColour);
      setActivePip(pipColour);
    }
  }, [throwSeed, palettes, diceColour, pipColour]);

  const pipTextures = useMemo(() => ({
    1: makePipTexture(1, activePip), 2: makePipTexture(2, activePip),
    3: makePipTexture(3, activePip), 4: makePipTexture(4, activePip),
    5: makePipTexture(5, activePip), 6: makePipTexture(6, activePip),
  }), [activePip]);

  useEffect(() => {
    if (!bodyRef.current || !throwSeed) return;
    const r = () => Math.random();
    const swipeX = throwVec ? Math.max(-1, Math.min(1, throwVec.x / 200)) : 0;
    const lane = indexOffset === 0 ? -1 : 1;
    bodyRef.current.setTranslation({
      x: lane * 0.6 - swipeX * 1.4 + (r() - 0.5) * 0.6,
      y: 2.2 + r() * 0.4,
      z: 1.1 + r() * 0.3,
    }, true);
    bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    bodyRef.current.setLinvel({
      x: swipeX * 3 + (r() - 0.5) * 2.0,
      y: -2.5 - r() * 2.0,
      z: -3.5 - r() * 2.0,
    }, true);
    bodyRef.current.setAngvel({
      x: (r() - 0.5) * 22,
      y: (r() - 0.5) * 22,
      z: (r() - 0.5) * 22,
    }, true);
    settledRef.current = false;
    restFramesRef.current = 0;
  }, [throwSeed, throwVec, indexOffset]);

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
        <meshStandardMaterial color={activeBody} roughness={0.45} metalness={0.05} />
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
 * Tile
 * ========================================================================== */

function Tile({ value, x, closed, selected, onClick, inkColour, letter, interactive }) {
  const { tealWoodTex } = useStb15Textures();
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
    <group ref={groupRef} position={[x, 0.08, -0.8]}>
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={interactive ? (e) => { e.stopPropagation(); onClick?.(value); } : undefined}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial
          map={tealWoodTex || null}
          roughness={0.6}
          emissive={selected ? '#15b8a6' : '#000000'}
          emissiveIntensity={selected ? 0.55 : 0}
        />
      </mesh>
      <Text
        position={[0, TILE_H / 2, TILE_D / 2 + 0.002]}
        fontSize={value > 9 ? 0.28 : 0.34}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
      >
        {value}
      </Text>
      <Text
        position={[0, TILE_H / 2, -TILE_D / 2 - 0.002]}
        rotation={[Math.PI, 0, 0]}
        fontSize={0.34}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
      >
        {letter || ''}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Scattered loose tiles
 * ========================================================================== */

function ScatteredTile({ letter, position, rotationY, inkColour, size = 1 }) {
  const { tealWoodTex } = useStb15Textures();
  const W = 0.7 * size;
  const H = 0.6 * size;
  const D = 0.12 * size;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, D / 2, 0]} castShadow>
        <boxGeometry args={[W, D, H]} />
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </mesh>
      {letter ? (
        <Text
          position={[0, D + 0.005, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.38 * size}
          color={inkColour}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008 * size}
          outlineColor="#000"
        >
          {letter}
        </Text>
      ) : null}
    </group>
  );
}

function ScatteredRow({ letters, baseZ, inkColour, seed, count = 8, size = 1, spread = 3.7 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const t = (i - (count - 1) / 2) / ((count - 1) / 2);
        const x = t * spread;
        const jitter = Math.sin((seed + i) * 9.7);
        const z = baseZ + jitter * 0.18 * size;
        const yRot = jitter * 0.45;
        return (
          <ScatteredTile
            key={i}
            letter={letters[i] || ''}
            position={[x + Math.cos((seed + i) * 4.3) * 0.08, 0, z]}
            rotationY={yRot}
            inkColour={inkColour}
            size={size}
          />
        );
      })}
    </>
  );
}

/* ============================================================================
 * Single-die toggle button (3D, inside the scene)
 * ========================================================================== */

function SingleDieToggle({ enabled, active, onToggle, inkColour }) {
  const { tealWoodTex } = useStb15Textures();
  const meshRef = useRef();
  const pressedRef = useRef(false);
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.04 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = offsetY.current;
  });

  // Placed on the right side of the front lip
  const posX = BOX_W / 2 - 0.85;
  const posZ = BOX_D / 2 + WALL_THICK / 2 + 0.35;

  return (
    <group position={[posX, 0.09, posZ]}>
      <mesh
        ref={meshRef}
        onPointerDown={(e) => { if (enabled) { e.stopPropagation(); pressedRef.current = true; } }}
        onPointerUp={(e) => { if (enabled) { e.stopPropagation(); pressedRef.current = false; onToggle?.(); } }}
        onPointerLeave={() => { pressedRef.current = false; }}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1.5, 0.18, 0.55]} />
        <meshStandardMaterial
          map={tealWoodTex || null}
          roughness={0.55}
          emissive={active ? '#15b8a6' : '#000'}
          emissiveIntensity={active ? 0.4 : 0}
        />
      </mesh>
      <Text
        position={[0, 0.15, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.14}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.012}
        outlineColor={enabled ? '#000' : '#555'}
        fillOpacity={enabled ? 1 : 0.4}
        renderOrder={10}
      >
        {active ? '1 DIE ✓' : '1 DIE'}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Big in-box button
 * ========================================================================== */

function BigBoxButton({ label, onClick, disabled, inkColour }) {
  const { tealWoodTex } = useStb15Textures();
  const meshRef = useRef();
  const pressedRef = useRef(false);
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.06 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = offsetY.current;
  });

  return (
    <group position={[0, 0.35, 0.85]}>
      <mesh
        ref={meshRef}
        onPointerDown={(e) => { if (!disabled) { e.stopPropagation(); pressedRef.current = true; } }}
        onPointerUp={(e) => { if (!disabled) { e.stopPropagation(); pressedRef.current = false; onClick?.(); } }}
        onPointerLeave={() => { pressedRef.current = false; }}
        castShadow receiveShadow
      >
        <boxGeometry args={[2.7, 0.25, 0.7]} />
        <meshStandardMaterial map={tealWoodTex} roughness={0.55} />
      </mesh>
      <Text
        position={[0, 0.18, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.32}
        color={inkColour}
        anchorX="center"
        anchorY="middle"
        fillOpacity={disabled ? 0.4 : 1}
        renderOrder={10}
      >
        {label}
      </Text>
    </group>
  );
}

/* ============================================================================
 * Box frame + colliders
 * ========================================================================== */

function BoxFrame() {
  const { tealWoodTex, velvetTex } = useStb15Textures();
  const R = 0.05;

  return (
    <group>
      {/* Felt floor */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.02, 0.01, BOX_D - WALL_THICK * 2 + 0.02]} />
        <meshStandardMaterial map={velvetTex || null} roughness={0.95} />
      </mesh>
      {/* Floor base */}
      <RoundedBox args={[BOX_W, 0.12, BOX_D]} radius={R} smoothness={3} position={[0, -0.06, 0]} receiveShadow>
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Left wall */}
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Right wall */}
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Back wall */}
      <RoundedBox args={[BOX_W, WALL_H, WALL_THICK]} radius={R} smoothness={3} position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Front lip (short) */}
      <RoundedBox args={[BOX_W, 0.4, WALL_THICK]} radius={R} smoothness={3} position={[0, 0.2, BOX_D / 2 - WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Tile rod */}
      <mesh position={[0, 0.08, -0.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.5} />
      </mesh>
    </group>
  );
}

function BoxColliders() {
  const innerW = BOX_W - WALL_THICK * 2;
  const innerD = BOX_D - WALL_THICK * 2;
  const tallH = 2.0;
  const halfTall = tallH / 2;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[BOX_W / 2, 0.05, BOX_D / 2]} position={[0, 0.005, 0]} restitution={0.2} friction={0.7} />
      <CuboidCollider args={[innerW / 2, halfTall, WALL_THICK / 2]} position={[0, halfTall, -BOX_D / 2 + WALL_THICK / 2]} restitution={0.35} friction={0.4} />
      <CuboidCollider args={[innerW / 2, halfTall, WALL_THICK / 2]} position={[0, halfTall, BOX_D / 2 - WALL_THICK / 2]} restitution={0.35} friction={0.4} />
      <CuboidCollider args={[WALL_THICK / 2, halfTall, innerD / 2]} position={[-BOX_W / 2 + WALL_THICK / 2, halfTall, 0]} restitution={0.35} friction={0.4} />
      <CuboidCollider args={[WALL_THICK / 2, halfTall, innerD / 2]} position={[BOX_W / 2 - WALL_THICK / 2, halfTall, 0]} restitution={0.35} friction={0.4} />
      <CuboidCollider args={[innerW / 2, 0.7, 0.1]} position={[0, 0.7, -0.55]} restitution={0.3} friction={0.4} />
    </RigidBody>
  );
}

/* ============================================================================
 * Kitchen cabinet / surface environment
 * ========================================================================== */

function CabinetEnvironment() {
  const { graniteTex, tealWoodTex } = useStb15Textures();

  return (
    <group position={[0, SURFACE_Y, 0]}>
      {/* Granite worktop surface */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[CAB_PANEL_W + 0.4, CAB_SURFACE_H, CAB_SURFACE_D]} />
        <meshStandardMaterial map={graniteTex || null} roughness={0.35} metalness={0.1} />
      </mesh>

      {/* Front vertical panel */}
      <mesh position={[0, -(CAB_PANEL_H / 2 + CAB_SURFACE_H / 2), CAB_SURFACE_D / 2 - CAB_PANEL_D / 2]} castShadow receiveShadow>
        <boxGeometry args={[CAB_PANEL_W, CAB_PANEL_H, CAB_PANEL_D]} />
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.5} />
      </mesh>

      {/* Back vertical panel */}
      <mesh position={[0, -(CAB_PANEL_H / 2 + CAB_SURFACE_H / 2), -(CAB_SURFACE_D / 2 - CAB_PANEL_D / 2)]} castShadow receiveShadow>
        <boxGeometry args={[CAB_PANEL_W, CAB_PANEL_H, CAB_PANEL_D]} />
        <meshStandardMaterial map={tealWoodTex || null} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Twirl celebration — 20 falling twirl.glb on win
 * ========================================================================== */

function TwirlInstance({ position, delay }) {
  const { scene } = useGLTF(TWIRL_URL);
  const bodyRef = useRef();
  const startedRef = useRef(false);
  const timerRef = useRef(null);

  // Clone the scene so each instance is independent
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (bodyRef.current) {
        startedRef.current = true;
        bodyRef.current.setTranslation(position, true);
        bodyRef.current.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: -2 - Math.random() * 3, z: (Math.random() - 0.5) * 1.5 }, true);
        bodyRef.current.setAngvel({
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 15,
          z: (Math.random() - 0.5) * 15,
        }, true);
      }
    }, delay);
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders="hull"
      restitution={0.4}
      friction={0.5}
      linearDamping={0.3}
      angularDamping={0.5}
      position={[position.x, position.y, position.z]}
    >
      <primitive object={clonedScene} scale={0.35} />
    </RigidBody>
  );
}

function TwirlCelebration({ active }) {
  const instances = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      position: {
        x: (Math.random() - 0.5) * BOX_W * 0.85,
        y: 5 + Math.random() * 3,
        z: (Math.random() - 0.5) * BOX_D * 0.7,
      },
      delay: Math.random() * 5000, // stagger over 5 seconds
    }));
  }, [active]);

  if (!active) return null;
  return (
    <>
      {instances.map((inst) => (
        <TwirlInstance key={inst.id} position={inst.position} delay={inst.delay} />
      ))}
    </>
  );
}

/* ============================================================================
 * Full scene
 * ========================================================================== */

function Stb15Scene({
  openTiles = ALL_TILES,
  selected = [],
  dice = [null, null],
  diceCount = 2,
  diceVisible = false,
  throwSeed = 0,
  throwVec = null,
  onTileTap,
  onDieSettled,
  config = DEFAULT_CONFIG,
  interactive = true,
  bigButton = null,
  scatteredSet = { back: '', front: '' },
  tileMessage = '',
  singleDieEnabled = false,
  singleDieActive = false,
  onToggleSingleDie,
  celebrating = false,
}) {
  const inboxLetters = useMemo(
    () => lettersFromMessage(tileMessage || config.hidden_message, 15),
    [tileMessage, config.hidden_message],
  );
  const backLetters = useMemo(() => lettersFromMessage(scatteredSet.back, 8), [scatteredSet.back]);
  const frontLetters = useMemo(() => lettersFromMessage(scatteredSet.front, 7), [scatteredSet.front]);
  const activePalettes = useMemo(
    () => (Array.isArray(config.dice_palettes) ? config.dice_palettes.filter((p) => p.active && p.body && p.pip) : []),
    [config.dice_palettes],
  );

  const diceSum = (dice[0] || 0) + (dice[1] || 0);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[4, 8, 4]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
      />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />

      <Physics gravity={[0, -22, 0]}>
        {/* Cabinet environment sits below the box */}
        <CabinetEnvironment />

        <BoxFrame />
        <BoxColliders />

        {ALL_TILES.map((v, i) => {
          const x = TILE_START_X + i * TILE_SPACING;
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

        <ScatteredRow letters={backLetters}  baseZ={-3.4} inkColour={config.ink_colour} seed={1.3} count={8} size={1.0}  spread={4.2} />
        <ScatteredRow letters={frontLetters} baseZ={2.45} inkColour={config.ink_colour} seed={4.7} count={7} size={0.66} spread={2.6} />

        {/* Dice — render second die only in 2-die mode */}
        <PhysicsDie
          throwSeed={throwSeed}
          throwVec={throwVec}
          indexOffset={0}
          onSettled={onDieSettled}
          diceColour={config.dice_colour}
          pipColour={config.pip_colour}
          palettes={activePalettes}
          visible={diceVisible}
        />
        <PhysicsDie
          throwSeed={throwSeed}
          throwVec={throwVec}
          indexOffset={1}
          onSettled={diceCount === 2 ? onDieSettled : undefined}
          diceColour={config.dice_colour}
          pipColour={config.pip_colour}
          palettes={activePalettes}
          visible={diceVisible && diceCount === 2}
        />

        {/* Score display */}
        {dice[0] && (diceCount === 1 ? true : dice[1]) && (
          <Text
            position={[-3.2, 0.06, 0.75]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.5}
            color="#ffffff"
            anchorX="left"
            anchorY="middle"
            renderOrder={5}
          >
            {`${diceCount === 1 ? dice[0] : diceSum}`}
          </Text>
        )}

        {/* Single-die toggle button */}
        <SingleDieToggle
          enabled={singleDieEnabled}
          active={singleDieActive}
          onToggle={onToggleSingleDie}
          inkColour={config.ink_colour}
        />

        {bigButton}

        {/* Win twirl celebration */}
        <TwirlCelebration active={celebrating} />
      </Physics>
    </>
  );
}

/* ============================================================================
 * Canvas shell
 * ========================================================================== */

function Stb15CanvasShell({ children, onPointerDown, onPointerUp, tableColour = '#d3f3ea' }) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-lg" style={{ background: tableColour }}>
      <div
        className="relative"
        style={{ aspectRatio: '6 / 5', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 8.8, 6.2], fov: 44 }}
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

export function ShutTheBox15Game({ showStatus = true }) {
  const { refresh: refreshBasket, account } = useBasket();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [scatteredSet, setScatteredSet] = useState({ back: '', front: '' });
  const [tableColour, setTableColour] = useState('#d3f3ea');
  const [tileMessage, setTileMessage] = useState('I_MISS_YOU_SO_MUCH!!');
  const [game, setGame] = useState(null);
  const [openTiles, setOpenTiles] = useState([...ALL_TILES]);
  const [selected, setSelected] = useState([]);
  const [dice, setDice] = useState([null, null]);
  const [throwSeed, setThrowSeed] = useState(0);
  const [throwVec, setThrowVec] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [winModal, setWinModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [singleDieActive, setSingleDieActive] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const settledRef = useRef([null, null]);

  // Whether all high tiles (7-15) are shut — enables the single-die toggle
  const singleDieEnabled = useMemo(
    () => HIGH_TILES.every((t) => !openTiles.includes(t)),
    [openTiles],
  );

  // Effective dice count
  const diceCount = singleDieActive && singleDieEnabled ? 1 : 2;

  const diceSum = diceCount === 1
    ? (dice[0] || 0)
    : (dice[0] || 0) + (dice[1] || 0);
  const selectedSum = useMemo(() => selected.reduce((a, b) => a + b, 0), [selected]);
  const canConfirm = phase === 'rolled' && selectedSum === diceSum && selected.length > 0;

  useEffect(() => {
    api.getStb15Config().then((c) => {
      if (!c) return;
      setConfig(c);
      const sets = Array.isArray(c.scattered_sets) ? c.scattered_sets.filter((s) => s.active) : [];
      if (sets.length > 0) {
        const pick = sets[Math.floor(Math.random() * sets.length)];
        setScatteredSet({ back: pick.back || '', front: pick.front || '' });
      }
      const tableSlots = Array.isArray(c.table_colours) ? c.table_colours.filter((t) => t.active && t.colour) : [];
      if (tableSlots.length > 0) {
        const pick = tableSlots[Math.floor(Math.random() * tableSlots.length)];
        setTableColour(pick.colour);
      } else {
        setTableColour(c.table_colour || '#d3f3ea');
      }
      setTileMessage(pickTileMessage(c));
    }).catch(() => {});
  }, []);

  async function newGame() {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    setCelebrating(false); setSingleDieActive(false);
    try {
      const g = await api.stb15Start();
      setGame(g);
      setOpenTiles([...ALL_TILES]);
      setSelected([]);
      setDice([null, null]);
      setThrowSeed(0);
      setPhase('idle');
      settledRef.current = [null, null];
      setTileMessage(pickTileMessage(config));
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  function onDieSettled(index, value) {
    // In single-die mode, only die 0 matters; ignore die 1 callbacks
    if (diceCount === 1 && index === 1) return;
    if (settledRef.current[index] !== null) return;

    settledRef.current = settledRef.current.slice();
    settledRef.current[index] = value;

    const bothSettled = diceCount === 1
      ? settledRef.current[0] !== null
      : settledRef.current[0] !== null && settledRef.current[1] !== null;

    if (bothSettled) {
      const d1 = settledRef.current[0];
      const d2 = diceCount === 2 ? settledRef.current[1] : 0;
      setDice([d1, diceCount === 2 ? d2 : null]);
      const target = diceCount === 1 ? d1 : d1 + d2;
      if (!hasValidClose(openTiles, target)) {
        setPhase('over');
        setMessage(`No valid combination for ${target}. Game over!`);
        api.stb15End({ game_id: game?.id, result: 'loss', final_tiles_open: openTiles }).catch(() => {});
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
      setCelebrating(true);
      setBusy(true);
      try {
        const res = await api.stb15End({ game_id: game.id, result: 'win', final_tiles_open: [] });
        if (refreshBasket) await refreshBasket();
        setMessage(`You shut the box! +${res.credited_pts} pts.`);
        setWinModal({ pts: res.credited_pts ?? 64 });
      } catch (e) { setError(e.message); }
      finally { setBusy(false); }
    } else {
      setPhase('idle');
    }
  }

  async function resetGame() {
    if (game && phase !== 'won') {
      try { await api.stb15End({ game_id: game.id, result: 'abandoned', final_tiles_open: openTiles }); } catch {}
    }
    setGame(null);
    setOpenTiles([...ALL_TILES]);
    setSelected([]);
    setDice([null, null]);
    setThrowSeed(0);
    settledRef.current = [null, null];
    setPhase('idle');
    setMessage('');
    setCelebrating(false);
    setSingleDieActive(false);
  }

  // Auto-close on sum match
  useEffect(() => {
    if (phase !== 'rolled') return;
    if (selected.length === 0) return;
    if (selectedSum !== diceSum) return;
    const t = setTimeout(() => { confirmClose(); }, 650);
    return () => clearTimeout(t);
  }, [selected, selectedSum, diceSum, phase]);

  // Auto-disable single die if high tiles become open again (shouldn't happen, but safety)
  useEffect(() => {
    if (!singleDieEnabled) setSingleDieActive(false);
  }, [singleDieEnabled]);

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
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  let bigButton = null;
  if (!game) {
    bigButton = <BigBoxButton label="START" onClick={newGame} disabled={busy} inkColour={config.ink_colour} />;
  } else if (phase === 'won' || phase === 'over') {
    bigButton = <BigBoxButton label="TRY AGAIN" onClick={newGame} disabled={busy} inkColour={config.ink_colour} />;
  }

  const diceVisible = phase === 'rolling' || phase === 'rolled' || phase === 'over' || phase === 'won';

  return (
    <div className="space-y-3">
      <Stb15CanvasShell onPointerDown={onPointerDown} onPointerUp={onPointerUp} tableColour={tableColour}>
        <Stb15Scene
          openTiles={openTiles}
          selected={selected}
          dice={dice}
          diceCount={diceCount}
          diceVisible={diceVisible}
          throwSeed={throwSeed}
          throwVec={throwVec}
          onTileTap={tapTile}
          onDieSettled={onDieSettled}
          config={config}
          interactive
          bigButton={bigButton}
          scatteredSet={scatteredSet}
          tileMessage={tileMessage}
          singleDieEnabled={singleDieEnabled}
          singleDieActive={singleDieActive}
          onToggleSingleDie={() => setSingleDieActive((v) => !v)}
          celebrating={celebrating}
        />
      </Stb15CanvasShell>

      {showStatus && phase === 'idle' && game && (
        <p className="text-center text-xs text-neutral-500">Swipe right to roll.. it's all in the fingers.</p>
      )}

      {singleDieEnabled && game && phase !== 'won' && phase !== 'over' && (
        <p className="text-center text-xs text-teal-600 font-medium">
          Tiles 7–15 are shut — single die available!
        </p>
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

      {winModal && (
        <Stb15WinModal pts={winModal.pts} balance={account?.points_balance} onClose={() => setWinModal(null)} />
      )}
    </div>
  );
}

function Stb15WinModal({ pts, balance, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Congratulations!
        </p>
        <p className="mt-3 text-center text-3xl font-extrabold leading-none text-pink-500">
          +{pts} POINTS
        </p>
        <div className="mt-5 rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm font-medium text-neutral-700">
          You shut the box — all 15 tiles!
        </div>
        {typeof balance === 'number' && (
          <p className="mt-4 text-center text-sm text-neutral-600">
            Your balance: <span className="font-semibold text-neutral-900">{balance.toLocaleString()} pts</span>
          </p>
        )}
        <button
          onClick={onClose}
          className="mt-6 block w-full rounded-xl bg-teal-300 py-3 text-base font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * Page wrapper
 * ========================================================================== */

export default function ShutTheBox15Page() {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Shut the Box — 15</h1>
        <span className="w-10" />
      </div>
      <ShutTheBox15Game />
    </div>
  );
}

// Preload the twirl model
useGLTF.preload(TWIRL_URL);
