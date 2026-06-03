import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Text, RoundedBox, useTexture, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useBasket } from '../lib/BasketContext.jsx';

/* ============================================================================
 * Constants
 * ========================================================================== */

const ALL_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Tiles that must ALL be shut for each staged dice reduction (player option)
const TILES_FOR_2_DICE = [10, 11, 12, 13, 14, 15];   // shut these → may switch to 2 dice
const TILES_FOR_1_DIE  = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]; // shut these → may switch to 1 die

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

const GRANITE_TEX_URL      = '/textures/granite.png?v=1';
const WOOD_TEX_URL         = '/textures/wood_table_worn.jpg?v=4';
const VELVET_TEX_URL       = '/textures/velour_velvet_diff.jpg?v=3';
const WOODEN_BUTTONS_URL   = '/textures/wooden_buttons.jpg?v=1';
const TWIRL_URL            = '/twirl.glb';

// Box dimensions — wider for 15 tiles
const BOX_W = 7.4;
const BOX_D = 4.2;
const WALL_H = 0.65;
const WALL_THICK = 0.22;
const TILE_W = 0.36;
const TILE_H = 0.75;
const TILE_D = 0.1;
const TILE_OPEN_ANGLE = -Math.PI / 5.5;
const TILE_SPACING = 0.47;
const TILE_START_X = -((15 - 1) / 2) * TILE_SPACING; // ≈ -3.29

// Surface sits just below the box floor
const SURFACE_Y = -0.12;
// Cabinet panel geometry
const CAB_PANEL_H = 1.6;
const CAB_PANEL_D = 0.18;

/* ============================================================================
 * Texture hook — wood_table_worn for box/tiles, granite for surface
 * ========================================================================== */

function useStb15Textures() {
  const [graniteTex, woodTex, velvetTex, buttonsTex] = useTexture([GRANITE_TEX_URL, WOOD_TEX_URL, VELVET_TEX_URL, WOODEN_BUTTONS_URL]);

  // Tiling textures
  [graniteTex, woodTex, velvetTex].forEach((tex) => {
    if (tex && tex.colorSpace !== THREE.SRGBColorSpace) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
    }
  });
  if (graniteTex) graniteTex.repeat.set(8, 6);
  if (woodTex) woodTex.repeat.set(2, 1.5);

  // Buttons texture — single instance, no tiling
  if (buttonsTex && buttonsTex.colorSpace !== THREE.SRGBColorSpace) {
    buttonsTex.colorSpace = THREE.SRGBColorSpace;
    buttonsTex.wrapS = buttonsTex.wrapT = THREE.ClampToEdgeWrapping;
    buttonsTex.repeat.set(1, 1);
    buttonsTex.anisotropy = 4;
    buttonsTex.needsUpdate = true;
  }

  return { graniteTex, woodTex, velvetTex, buttonsTex };
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function lettersFromMessage(msg, len) {
  const m = (msg || '').padEnd(len, '_').slice(0, len);
  return Array.from({ length: len }, (_, i) => (m[i] === '_' ? '' : m[i]));
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
 * Pip textures / Die helpers
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
  { value: 1, pos: [0, PIP_OFFSET, 0],  rot: [-Math.PI / 2, 0, 0] },
  { value: 6, pos: [0, -PIP_OFFSET, 0], rot: [Math.PI / 2, 0, 0] },
  { value: 2, pos: [0, 0, PIP_OFFSET],  rot: [0, 0, 0] },
  { value: 5, pos: [0, 0, -PIP_OFFSET], rot: [0, Math.PI, 0] },
  { value: 3, pos: [PIP_OFFSET, 0, 0],  rot: [0, Math.PI / 2, 0] },
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
 * PhysicsDie — supports 3 lanes (indexOffset 0,1,2)
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
    // Three lanes: -1.2, 0, +1.2
    const lane = (indexOffset - 1) * 1.2;

    bodyRef.current.setTranslation({
      x: lane - swipeX * 1.4 + (r() - 0.5) * 0.5,
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
        const rot = body.rotation();
        const q = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
        settledRef.current = true;
        onSettled?.(indexOffset, readDieFace(q));
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
  const { woodTex } = useStb15Textures();
  const groupRef = useRef();
  const angleRef = useRef(TILE_OPEN_ANGLE);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = closed ? Math.PI / 2 : TILE_OPEN_ANGLE;
    angleRef.current += (target - angleRef.current) * Math.min(delta * 9, 1);
    groupRef.current.rotation.x = angleRef.current;
  });

  return (
    <group ref={groupRef} position={[x, 0.08, -1.1]}>
      <mesh
        position={[0, TILE_H / 2, 0]}
        castShadow
        onClick={interactive ? (e) => { e.stopPropagation(); onClick?.(value); } : undefined}
      >
        <boxGeometry args={[TILE_W, TILE_H, TILE_D]} />
        <meshStandardMaterial
          map={woodTex || null}
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
 * Scattered loose tiles — also wood_table_worn
 * ========================================================================== */

function ScatteredTile({ letter, position, rotationY, inkColour, size = 1 }) {
  const { woodTex } = useStb15Textures();
  const W = 0.7 * size, H = 0.6 * size, D = 0.12 * size;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, D / 2, 0]} castShadow>
        <boxGeometry args={[W, D, H]} />
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
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

function ScatteredRow({ letters, baseZ, inkColour, seed, count = 8, size = 1, spread = 3.7, xOffset = 0 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const t = count > 1 ? (i - (count - 1) / 2) / ((count - 1) / 2) : 0;
        const jitter = Math.sin((seed + i) * 9.7);
        return (
          <ScatteredTile
            key={i}
            letter={letters[i] || ''}
            position={[xOffset + t * spread + Math.cos((seed + i) * 4.3) * 0.08, 0, baseZ + jitter * 0.18 * size]}
            rotationY={jitter * 0.45}
            inkColour={inkColour}
            size={size}
          />
        );
      })}
    </>
  );
}

/* ============================================================================
 * Combined dice-count toggle panel — single wooden_buttons.png mesh
 * Left half = "2 DICE" (unlocks when 10-15 shut)
 * Right half = "1 DIE"  (unlocks when 4-15 shut)
 * Texture is applied once across the full panel, no tiling.
 * ========================================================================== */

// Panel sits flat — pushed well forward so it clears the front scattered tiles
const BTN_PANEL_W = 4.0;
const BTN_PANEL_D = 0.81;
const BTN_PANEL_H = 0.22;
const BTN_PANEL_Z_DEFAULT = 4.0;
const BTN_PANEL_Y = 0.09;

function CombinedDicePanel({ can2Dice, using2Dice, onToggle2Dice, can1Die, using1Die, onToggle1Die, panelX = 0, panelZ = BTN_PANEL_Z_DEFAULT, panelRotY = 0 }) {
  const { buttonsTex } = useStb15Textures();
  const meshRef = useRef();
  const pressedRef = useRef(null); // 'left' | 'right' | null
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.04 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = offsetY.current;
  });

  function handlePointerDown(e, side) {
    const enabled = side === 'left' ? can2Dice : can1Die;
    if (!enabled) return;
    e.stopPropagation();
    pressedRef.current = side;
  }
  function handlePointerUp(e, side) {
    if (pressedRef.current !== side) return;
    e.stopPropagation();
    pressedRef.current = null;
    if (side === 'left' && can2Dice) onToggle2Dice?.();
    if (side === 'right' && can1Die)  onToggle1Die?.();
  }

  const halfW = BTN_PANEL_W / 4; // half of each side

  return (
    <group position={[panelX, BTN_PANEL_Y, panelZ]} rotation={[0, panelRotY, 0]}>
      {/* Main visible panel — glows teal when either side is active */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[BTN_PANEL_W, BTN_PANEL_H, BTN_PANEL_D]} />
        <meshStandardMaterial
          map={buttonsTex || null}
          roughness={0.45}
          metalness={0.05}
          emissive={(can2Dice || can1Die) ? '#e773b0' : '#000000'}
          emissiveIntensity={(can2Dice || can1Die) ? 0.4 : 0}
        />
      </mesh>

      {/* Invisible left click zone (2 DICE) */}
      <mesh
        position={[-BTN_PANEL_W / 4, 0, 0]}
        onPointerDown={(e) => handlePointerDown(e, 'left')}
        onPointerUp={(e) => handlePointerUp(e, 'left')}
        onPointerLeave={() => { if (pressedRef.current === 'left') pressedRef.current = null; }}
      >
        <boxGeometry args={[BTN_PANEL_W / 2 - 0.05, BTN_PANEL_H + 0.02, BTN_PANEL_D + 0.02]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Invisible right click zone (1 DIE) */}
      <mesh
        position={[BTN_PANEL_W / 4, 0, 0]}
        onPointerDown={(e) => handlePointerDown(e, 'right')}
        onPointerUp={(e) => handlePointerUp(e, 'right')}
        onPointerLeave={() => { if (pressedRef.current === 'right') pressedRef.current = null; }}
      >
        <boxGeometry args={[BTN_PANEL_W / 2 - 0.05, BTN_PANEL_H + 0.02, BTN_PANEL_D + 0.02]} />
        <meshStandardMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* "2 DICE" label — only visible when unlocked */}
      {can2Dice && (
        <Text
          position={[-BTN_PANEL_W / 4, BTN_PANEL_H / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.175}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          renderOrder={10}
        >
          {using2Dice ? '2 DICE MODE ✓' : '2 DICE MODE'}
        </Text>
      )}

      {/* "1 DIE" label — only visible when unlocked */}
      {can1Die && (
        <Text
          position={[BTN_PANEL_W / 4, BTN_PANEL_H / 2 + 0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.175}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          renderOrder={10}
        >
          {using1Die ? '1 DIE MODE ✓' : '1 DIE MODE'}
        </Text>
      )}
    </group>
  );
}

/* ============================================================================
 * Big in-box button
 * ========================================================================== */

function BigBoxButton({ label, onClick, disabled, inkColour }) {
  const { woodTex } = useStb15Textures();
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
        <boxGeometry args={[3.4, 0.32, 1.0]} />
        <meshStandardMaterial map={woodTex} roughness={0.55} />
      </mesh>
      <Text
        position={[0, 0.22, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.42}
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
 * Box frame + colliders — wood_table_worn throughout
 * ========================================================================== */

function BoxFrame() {
  const { woodTex, velvetTex } = useStb15Textures();
  const R = 0.05;

  return (
    <group>
      {/* Felt floor — velvet */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[BOX_W - WALL_THICK * 2 + 0.02, 0.01, BOX_D - WALL_THICK * 2 + 0.02]} />
        <meshStandardMaterial map={velvetTex || null} roughness={0.95} />
      </mesh>
      {/* Floor base */}
      <RoundedBox args={[BOX_W, 0.12, BOX_D]} radius={R} smoothness={3} position={[0, -0.06, 0]} receiveShadow>
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Walls */}
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[-BOX_W / 2 + WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[WALL_THICK, WALL_H, BOX_D]} radius={R} smoothness={3} position={[BOX_W / 2 - WALL_THICK / 2, WALL_H / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
      </RoundedBox>
      <RoundedBox args={[BOX_W, WALL_H, WALL_THICK]} radius={R} smoothness={3} position={[0, WALL_H / 2, -BOX_D / 2 + WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Front lip (short) */}
      <RoundedBox args={[BOX_W, 0.4, WALL_THICK]} radius={R} smoothness={3} position={[0, 0.2, BOX_D / 2 - WALL_THICK / 2]} castShadow receiveShadow>
        <meshStandardMaterial map={woodTex || null} roughness={0.6} />
      </RoundedBox>
      {/* Tile rod */}
      <mesh position={[0, 0.08, -1.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, BOX_W - WALL_THICK * 2 - 0.1, 16]} />
        <meshStandardMaterial map={woodTex || null} roughness={0.5} />
      </mesh>
    </group>
  );
}

function BoxColliders() {
  const innerW = BOX_W - WALL_THICK * 2;
  const innerD = BOX_D - WALL_THICK * 2;
  const tallH = 2.0, halfTall = tallH / 2;
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
 * Kitchen cabinet environment
 * Granite surface fills the entire background; two teal_wood vertical panels
 * ========================================================================== */

function CabinetEnvironment() {
  const { graniteTex, woodTex } = useStb15Textures();

  // Giant surface — large enough to fill the entire camera view
  const SURF_W = 40;
  const SURF_D = 40;
  const SURF_H = 0.14;

  const PANEL_W = BOX_W + 0.6;

  return (
    <group position={[0, SURFACE_Y, 0]}>
      {/* Enormous granite worktop */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[SURF_W, SURF_H, SURF_D]} />
        <meshStandardMaterial map={graniteTex || null} roughness={0.35} metalness={0.08} />
      </mesh>

      {/* Front vertical panel */}
      <mesh
        position={[0, -(CAB_PANEL_H / 2 + SURF_H / 2), (BOX_D / 2 + 0.5) - CAB_PANEL_D / 2]}
        castShadow receiveShadow
      >
        <boxGeometry args={[PANEL_W, CAB_PANEL_H, CAB_PANEL_D]} />
        <meshStandardMaterial map={woodTex || null} roughness={0.5} />
      </mesh>

      {/* Back vertical panel */}
      <mesh
        position={[0, -(CAB_PANEL_H / 2 + SURF_H / 2), -(BOX_D / 2 + 0.5) + CAB_PANEL_D / 2]}
        castShadow receiveShadow
      >
        <boxGeometry args={[PANEL_W, CAB_PANEL_H, CAB_PANEL_D]} />
        <meshStandardMaterial map={woodTex || null} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ============================================================================
 * Twirl celebration — 20 falling twirl.glb
 * ========================================================================== */

function TwirlInstance({ position, delay }) {
  const { scene } = useGLTF(TWIRL_URL);
  const bodyRef = useRef();
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.setTranslation(position, true);
        bodyRef.current.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: -2 - Math.random() * 3, z: (Math.random() - 0.5) * 1.5 }, true);
        bodyRef.current.setAngvel({ x: (Math.random() - 0.5) * 15, y: (Math.random() - 0.5) * 15, z: (Math.random() - 0.5) * 15 }, true);
      }
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <RigidBody ref={bodyRef} type="dynamic" colliders="hull" restitution={0.4} friction={0.5} linearDamping={0.3} angularDamping={0.5} position={[position.x, position.y, position.z]}>
      <primitive object={clonedScene} scale={1.4} />
    </RigidBody>
  );
}

/* ============================================================================
 * Generic OBJ+MTL model loader
 * Usage: <ObjModel dir="/models/bottle/" obj="name.obj" mtl="name.mtl" ... />
 * The component suspends while loading (wrap in <Suspense>).
 * ========================================================================== */

// ObjModel uses sequential manual loading (MTL → preload → OBJ).
// colorOverride: optional hex string — overrides every mesh's diffuse colour.
function ObjModel({ dir, obj, mtl, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, colorOverride = null }) {
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const mtlLoader = new MTLLoader();
    mtlLoader.setResourcePath(dir);
    mtlLoader.load(`${dir}${mtl}`, (mats) => {
      if (cancelled) return;
      mats.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(mats);
      objLoader.load(`${dir}${obj}`, (object) => {
        if (!cancelled) setLoaded(object);
      });
    });
    return () => { cancelled = true; };
  }, [dir, obj, mtl]);

  // Apply / re-apply colour override whenever the loaded object or override changes
  useEffect(() => {
    if (!loaded) return;
    const col = colorOverride ? new THREE.Color(colorOverride) : null;
    loaded.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (col) { m.color.set(col); }
        m.needsUpdate = true;
      });
    });
  }, [loaded, colorOverride]);

  if (!loaded) return null;
  return <primitive object={loaded} position={position} rotation={rotation} scale={scale} />;
}

// GlbModel — colorOverride applied after clone
function GlbModel({ url, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, colorOverride = null }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    if (colorOverride) {
      const col = new THREE.Color(colorOverride);
      c.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => { m.color.set(col); m.needsUpdate = true; });
      });
    }
    return c;
  }, [scene, colorOverride]);
  return <primitive object={clone} position={position} rotation={rotation} scale={scale} />;
}

// ProceduralBanana — colorOverride overrides the body colour
function ProceduralBanana({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, colorOverride = null }) {
  const curve = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = (i / 20) * Math.PI * 0.62;
      pts.push(new THREE.Vector3(Math.cos(t) * 1.0 - 0.85, Math.sin(t) * 0.55, 0));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, []);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 20, 0.09, 8, false]} />
        <meshStandardMaterial color={colorOverride || '#F4D03F'} roughness={0.85} />
      </mesh>
      <mesh position={[0.16, 0.54, 0]} castShadow>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#7D6608" roughness={0.9} />
      </mesh>
    </group>
  );
}

// Surface top Y in world space = SURFACE_Y (group offset) + SURF_H/2
// SURFACE_Y = -0.12, SURF_H = 0.14 → top = -0.12 + 0.07 = -0.05
const SURFACE_TOP_Y = -0.05;

// All scene props go here — add a new entry per /models/<folder>
// Static per-model constants (file paths + fixed base rotation).
// pos_x / pos_z / rot_y / scale come from the DB via props state.
// Static model definitions — file paths only.
// Full rotation (X/Y/Z in degrees) comes from the DB via stb15_scene_props.
// type: 'obj' = OBJ+MTL file pair | 'glb' = single GLB | 'procedural' = built-in geometry
const PROP_DEFINITIONS = {
  bottle: { type: 'obj', dir: '/models/bottle/', obj: '14042_750_mL_Wine_Bottle_r_v1_L3.obj', mtl: '14042_750_mL_Wine_Bottle_r_v1_L3.mtl' },
  kettle: { type: 'obj', dir: '/models/kettle/', obj: 'cgaxis_models_116_09_obj_electric_kettle.obj', mtl: 'cgaxis_models_116_09_obj.mtl' },
  cup:    { type: 'glb', url: '/cup.glb' },
  banana: { type: 'procedural', component: 'banana' },
  key:    { type: 'obj', dir: '/models/key/', obj: 'standard_key.obj', mtl: 'key.mtl' },
  // twirl_1 / twirl_2 are GLB — handled by DecorativeTwirls
};

const DEG = Math.PI / 180;

function SceneModels({ sceneProps = [] }) {
  const propMap = useMemo(() => Object.fromEntries(sceneProps.map((p) => [p.key, p])), [sceneProps]);

  return (
    <>
      {Object.entries(PROP_DEFINITIONS).map(([key, def]) => {
        const p = propMap[key];
        if (!p || !p.active) return null;
        const pos = [p.pos_x, SURFACE_TOP_Y + (p.pos_y ?? 0), p.pos_z];
        const rot = [(p.rot_x_deg ?? 0) * DEG, (p.rot_y_deg ?? 0) * DEG, (p.rot_z_deg ?? 0) * DEG];
        const sc  = p.scale ?? 1;

        const co = p.color_override || null;
        if (def.type === 'obj') {
          return <ObjModel key={key} dir={def.dir} obj={def.obj} mtl={def.mtl} position={pos} rotation={rot} scale={sc} colorOverride={co} />;
        }
        if (def.type === 'glb') {
          return <Suspense key={key} fallback={null}><GlbModel url={def.url} position={pos} rotation={rot} scale={sc} colorOverride={co} /></Suspense>;
        }
        if (def.type === 'procedural' && def.component === 'banana') {
          return <ProceduralBanana key={key} position={pos} rotation={rot} scale={sc} colorOverride={co} />;
        }
        return null;
      })}
    </>
  );
}

/* ============================================================================
 * Static decorative twirl instances on the surface
 * ========================================================================== */

// Twirl keys in the props table that represent static chocolate bar instances
const TWIRL_PROP_KEYS = ['twirl_1', 'twirl_2'];

function DecorativeTwirls({ sceneProps = [] }) {
  const { scene } = useGLTF(TWIRL_URL);

  const activeTwirls = useMemo(
    () => sceneProps.filter((p) => TWIRL_PROP_KEYS.includes(p.key) && p.active),
    [sceneProps],
  );

  const clones = useMemo(
    () => activeTwirls.map(() => scene.clone(true)),
    [scene, activeTwirls.length],
  );

  return (
    <>
      {activeTwirls.map((p, i) => (
        <primitive
          key={p.key}
          object={clones[i]}
          position={[p.pos_x, SURFACE_TOP_Y, p.pos_z]}
          rotation={[
            (p.rot_x_deg ?? 0) * DEG,
            (p.rot_y_deg ?? 0) * DEG,
            (p.rot_z_deg ?? 0) * DEG,
          ]}
          scale={p.scale}
        />
      ))}
    </>
  );
}

function TwirlCelebration({ active }) {
  const instances = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      position: { x: (Math.random() - 0.5) * 18, y: 6 + Math.random() * 4, z: (Math.random() - 0.5) * 14 },
      delay: Math.random() * 5000,
    }));
  }, [active]);

  if (!active) return null;
  return <>{instances.map((inst) => <TwirlInstance key={inst.id} position={inst.position} delay={inst.delay} />)}</>;
}

/* ============================================================================
 * Debug win button — temporary, sits on surface to the right of the button panel
 * ========================================================================== */

function DebugWinButton({ onDebugWin, inkColour, panelZ = BTN_PANEL_Z_DEFAULT }) {
  const { woodTex } = useStb15Textures();
  const meshRef = useRef();
  const pressedRef = useRef(false);
  const offsetY = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const target = pressedRef.current ? -0.04 : 0;
    offsetY.current += (target - offsetY.current) * Math.min(delta * 18, 1);
    meshRef.current.position.y = offsetY.current;
  });

  return (
    <group position={[3.2, BTN_PANEL_Y, panelZ]}>
      <mesh
        ref={meshRef}
        onPointerDown={(e) => { e.stopPropagation(); pressedRef.current = true; }}
        onPointerUp={(e) => { e.stopPropagation(); pressedRef.current = false; onDebugWin?.(); }}
        onPointerLeave={() => { pressedRef.current = false; }}
        castShadow receiveShadow
      >
        <boxGeometry args={[1.6, BTN_PANEL_H, BTN_PANEL_D]} />
        <meshStandardMaterial map={woodTex || null} roughness={0.5} emissive="#ff4400" emissiveIntensity={0.25} />
      </mesh>
      <Text
        position={[0, BTN_PANEL_H / 2 + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.14}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        renderOrder={10}
      >
        ★ SIMULATE WIN
      </Text>
    </group>
  );
}

/* ============================================================================
 * Camera controller — reads position/fov from config and applies imperatively
 * ========================================================================== */

function CameraSetup({ posX = 0, posY = 10.5, posZ = 7.8, fov = 46 }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(posX, posY, posZ);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [posX, posY, posZ, fov]);
  return null;
}

/* ============================================================================
 * Full 3D scene
 * ========================================================================== */

function Stb15Scene({
  openTiles = ALL_TILES,
  selected = [],
  dice = [null, null, null],
  diceCount = 3,
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
  can2Dice = false,
  can1Die = false,
  using2Dice = false,
  using1Die = false,
  onToggle2Dice,
  onToggle1Die,
  celebrating = false,
  onDebugWin,
  sceneProps = [],
}) {
  const inboxLetters = useMemo(
    () => lettersFromMessage(tileMessage || config.hidden_message, 15),
    [tileMessage, config.hidden_message],
  );
  const backLetters  = useMemo(() => lettersFromMessage(scatteredSet.back, 10),  [scatteredSet.back]);
  const frontLetters = useMemo(() => lettersFromMessage(scatteredSet.front, 9), [scatteredSet.front]);

  // Layout positions driven by scene props (fall back to defaults if not yet loaded)
  const propMap = useMemo(() => Object.fromEntries(sceneProps.map((p) => [p.key, p])), [sceneProps]);
  const backTilesZ     = propMap.tiles_back?.pos_z  ?? -4.8;
  const backTilesX     = propMap.tiles_back?.pos_x  ?? 0;
  const frontTilesZ    = propMap.tiles_front?.pos_z ?? 2.3;
  const frontTilesX    = propMap.tiles_front?.pos_x ?? 0;
  const frontTilesSize = propMap.tiles_front?.scale ?? 0.825;
  const btnPanelX      = propMap.btn_panel?.pos_x   ?? 0;
  const btnPanelZ      = propMap.btn_panel?.pos_z   ?? BTN_PANEL_Z_DEFAULT;
  const btnPanelRotY   = (propMap.btn_panel?.rot_y_deg ?? 0) * DEG;
  const boxPropX       = propMap.box?.pos_x ?? 0;
  const boxPropZ       = propMap.box?.pos_z ?? 0;
  const boxPropScale   = propMap.box?.scale ?? 1;
  const activePalettes = useMemo(
    () => (Array.isArray(config.dice_palettes) ? config.dice_palettes.filter((p) => p.active && p.body && p.pip) : []),
    [config.dice_palettes],
  );

  const totalDice = diceCount === 1 ? dice[0] : diceCount === 2 ? (dice[0] || 0) + (dice[1] || 0) : (dice[0] || 0) + (dice[1] || 0) + (dice[2] || 0);
  const showSum = diceCount === 1 ? dice[0] !== null : diceCount === 2 ? (dice[0] !== null && dice[1] !== null) : (dice[0] !== null && dice[1] !== null && dice[2] !== null);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 8, 4]} intensity={1.0} castShadow shadow-mapSize-width={512} shadow-mapSize-height={512} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={8} shadow-camera-bottom={-8} />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />

      <CameraSetup
        posX={config.camera_pos_x ?? 0}
        posY={config.camera_pos_y ?? 10.5}
        posZ={config.camera_pos_z ?? 7.8}
        fov={config.camera_fov ?? 46}
      />

      <Physics gravity={[0, -22, 0]}>
        {/* Invisible ground collider matching the granite surface — keeps falling objects on top */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[25, 0.07, 25]} position={[0, SURFACE_Y, 0]} />
        </RigidBody>

        <CabinetEnvironment />

        {/* Box + tiles wrapped in admin-positionable group */}
        <group position={[boxPropX, 0, boxPropZ]} scale={boxPropScale}>
          <BoxFrame />
          <BoxColliders />

          {ALL_TILES.map((v, i) => (
            <Tile
              key={v}
              value={v}
              x={TILE_START_X + i * TILE_SPACING}
              closed={!openTiles.includes(v)}
              selected={selected.includes(v)}
              onClick={onTileTap}
              inkColour={config.ink_colour}
              letter={inboxLetters[v - 1]}
              interactive={interactive}
            />
          ))}
        </group>

        <ScatteredRow letters={backLetters}  baseZ={backTilesZ}  xOffset={backTilesX}  inkColour={config.ink_colour} seed={1.3} count={10} size={1.0}         spread={4.8} />
        <ScatteredRow letters={frontLetters} baseZ={frontTilesZ} xOffset={frontTilesX} inkColour={config.ink_colour} seed={4.7} count={9}  size={frontTilesSize} spread={4.5} />

        {/* 3 dice — die index 1 visible only in 2+ mode, die index 2 visible only in 3-dice mode */}
        <PhysicsDie throwSeed={throwSeed} throwVec={throwVec} indexOffset={0} onSettled={onDieSettled} diceColour={config.dice_colour} pipColour={config.pip_colour} palettes={activePalettes} visible={diceVisible} />
        <PhysicsDie throwSeed={throwSeed} throwVec={throwVec} indexOffset={1} onSettled={diceCount >= 2 ? onDieSettled : undefined} diceColour={config.dice_colour} pipColour={config.pip_colour} palettes={activePalettes} visible={diceVisible && diceCount >= 2} />
        <PhysicsDie throwSeed={throwSeed} throwVec={throwVec} indexOffset={2} onSettled={diceCount >= 3 ? onDieSettled : undefined} diceColour={config.dice_colour} pipColour={config.pip_colour} palettes={activePalettes} visible={diceVisible && diceCount >= 3} />

        {/* Dice sum display */}
        {showSum && (
          <Text position={[-3.2, 0.06, 0.3]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.5} color="#ffffff" anchorX="left" anchorY="middle" renderOrder={5}>
            {`${totalDice}`}
          </Text>
        )}

        {/* Combined dice-count panel with wooden_buttons.png texture */}
        <CombinedDicePanel
          can2Dice={can2Dice}
          using2Dice={using2Dice}
          onToggle2Dice={onToggle2Dice}
          can1Die={can1Die}
          using1Die={using1Die}
          onToggle1Die={onToggle1Die}
          panelX={btnPanelX}
          panelZ={btnPanelZ}
          panelRotY={btnPanelRotY}
        />

        {/* Static decorative twirl props on the surface */}
        <DecorativeTwirls sceneProps={sceneProps} />

        {/* OBJ/MTL prop models on the surface */}
        <SceneModels sceneProps={sceneProps} />

        {/* DEBUG — temporary win simulator button, remove once verified */}
        {onDebugWin && <DebugWinButton onDebugWin={onDebugWin} inkColour={config.ink_colour} panelZ={btnPanelZ} />}

        {bigButton}
        <TwirlCelebration active={celebrating} />
      </Physics>
    </>
  );
}

/* ============================================================================
 * Canvas shell — zoomed out camera for 15 tiles
 * ========================================================================== */

function Stb15CanvasShell({ children, onPointerDown, onPointerUp, tableColour = '#d3f3ea' }) {
  return (
    <div className="overflow-hidden rounded-2xl shadow-lg" style={{ background: tableColour }}>
      <div className="relative" style={{ aspectRatio: '6 / 5', touchAction: 'none' }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 10.5, 7.8], fov: 46 }} gl={{ antialias: true, alpha: true }}>
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
  const [config, setConfig]             = useState(DEFAULT_CONFIG);
  const [scatteredSet, setScatteredSet] = useState({ back: '', front: '' });
  const [tableColour, setTableColour]   = useState('#d3f3ea');
  const [tileMessage, setTileMessage]   = useState('I_MISS_YOU_SO_MUCH!!');
  const [game, setGame]                 = useState(null);
  const [openTiles, setOpenTiles]       = useState([...ALL_TILES]);
  const [selected, setSelected]         = useState([]);
  const [dice, setDice]                 = useState([null, null, null]);
  const [throwSeed, setThrowSeed]       = useState(0);
  const [throwVec, setThrowVec]         = useState(null);
  const [phase, setPhase]               = useState('idle');
  const [message, setMessage]           = useState('');
  const [winModal, setWinModal]         = useState(null);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState(null);
  const [using2Dice, setUsing2Dice]     = useState(false);
  const [using1Die, setUsing1Die]       = useState(false);
  const [celebrating, setCelebrating]   = useState(false);
  const [sceneProps, setSceneProps]     = useState([]);
  const settledRef = useRef([null, null, null]);

  // Unlock conditions
  const can2Dice = useMemo(() => TILES_FOR_2_DICE.every((t) => !openTiles.includes(t)), [openTiles]);
  const can1Die  = useMemo(() => TILES_FOR_1_DIE.every((t)  => !openTiles.includes(t)), [openTiles]);

  // Effective dice count
  const diceCount = using1Die && can1Die ? 1 : using2Dice && can2Dice ? 2 : 3;

  const diceSum = useMemo(() => {
    if (diceCount === 1) return dice[0] || 0;
    if (diceCount === 2) return (dice[0] || 0) + (dice[1] || 0);
    return (dice[0] || 0) + (dice[1] || 0) + (dice[2] || 0);
  }, [dice, diceCount]);
  const selectedSum = useMemo(() => selected.reduce((a, b) => a + b, 0), [selected]);
  const canConfirm = phase === 'rolled' && selectedSum === diceSum && selected.length > 0;

  // Revoke higher-mode toggles if conditions become false (shouldn't happen but safety)
  useEffect(() => { if (!can2Dice) { setUsing2Dice(false); } }, [can2Dice]);
  useEffect(() => { if (!can1Die)  { setUsing1Die(false);  } }, [can1Die]);

  useEffect(() => {
    api.getStb15Props().then((rows) => { if (Array.isArray(rows)) setSceneProps(rows); }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getStb15Config().then((c) => {
      if (!c) return;
      setConfig(c);
      const sets = Array.isArray(c.scattered_sets) ? c.scattered_sets.filter((s) => s.active) : [];
      if (sets.length > 0) setScatteredSet({ back: sets[Math.floor(Math.random() * sets.length)].back || '', front: sets[Math.floor(Math.random() * sets.length)].front || '' });
      const tableSlots = Array.isArray(c.table_colours) ? c.table_colours.filter((t) => t.active && t.colour) : [];
      setTableColour(tableSlots.length > 0 ? tableSlots[Math.floor(Math.random() * tableSlots.length)].colour : c.table_colour || '#d3f3ea');
      setTileMessage(pickTileMessage(c));
    }).catch(() => {});
  }, []);

  async function newGame() {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    setCelebrating(false); setUsing2Dice(false); setUsing1Die(false);
    try {
      const g = await api.stb15Start();
      setGame(g);
      setOpenTiles([...ALL_TILES]);
      setSelected([]);
      setDice([null, null, null]);
      setThrowSeed(0);
      setPhase('idle');
      settledRef.current = [null, null, null];
      setTileMessage(pickTileMessage(config));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function onDieSettled(index, value) {
    // Ignore dice beyond the current count
    if (index >= diceCount) return;
    if (settledRef.current[index] !== null) return;
    settledRef.current = [...settledRef.current];
    settledRef.current[index] = value;

    const allSettled = Array.from({ length: diceCount }, (_, i) => settledRef.current[i]).every((v) => v !== null);
    if (allSettled) {
      const d = settledRef.current;
      const newDice = [d[0], diceCount >= 2 ? d[1] : null, diceCount >= 3 ? d[2] : null];
      setDice(newDice);
      const target = (d[0] || 0) + (diceCount >= 2 ? d[1] || 0 : 0) + (diceCount >= 3 ? d[2] || 0 : 0);
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
    setDice([null, null, null]);
    settledRef.current = [null, null, null];
    setThrowVec(swipeVec);
    setThrowSeed((s) => s + 1);
  }

  function tapTile(v) {
    if (phase !== 'rolled') return;
    setSelected((sel) => sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  }

  async function confirmClose() {
    if (!canConfirm) return;
    const newOpen = openTiles.filter((t) => !selected.includes(t));
    setOpenTiles(newOpen);
    setSelected([]);
    setDice([null, null, null]);
    settledRef.current = [null, null, null];
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

  async function debugSimulateWin() {
    if (!game || phase === 'won') return;
    setOpenTiles([]);
    setSelected([]);
    setDice([null, null, null]);
    settledRef.current = [null, null, null];
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
  }

  async function resetGame() {
    if (game && phase !== 'won') {
      try { await api.stb15End({ game_id: game.id, result: 'abandoned', final_tiles_open: openTiles }); } catch {}
    }
    setGame(null); setOpenTiles([...ALL_TILES]); setSelected([]);
    setDice([null, null, null]); setThrowSeed(0);
    settledRef.current = [null, null, null];
    setPhase('idle'); setMessage(''); setCelebrating(false);
    setUsing2Dice(false); setUsing1Die(false);
  }

  // Auto-close on sum match
  useEffect(() => {
    if (phase !== 'rolled' || selected.length === 0 || selectedSum !== diceSum) return;
    const t = setTimeout(() => { confirmClose(); }, 650);
    return () => clearTimeout(t);
  }, [selected, selectedSum, diceSum, phase]);

  const swipeStart = useRef(null);
  function onPointerDown(e) {
    if (phase !== 'idle' || !game) return;
    swipeStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onPointerUp(e) {
    const s = swipeStart.current; swipeStart.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    const speed = Math.sqrt(dx * dx + dy * dy) / Math.max(1, performance.now() - s.t);
    if (Math.abs(dx) > 40 && Math.abs(dy) < Math.abs(dx) * 0.8 && speed > 0.25) {
      triggerRoll({ x: dx, y: dy });
    }
  }

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;

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
          can2Dice={can2Dice}
          can1Die={can1Die}
          using2Dice={using2Dice}
          using1Die={using1Die}
          onToggle2Dice={() => { setUsing2Dice((v) => !v); setUsing1Die(false); }}
          onToggle1Die={() => { setUsing1Die((v) => !v); setUsing2Dice(false); }}
          celebrating={celebrating}
          onDebugWin={config.show_debug_win && game && phase !== 'won' ? debugSimulateWin : null}
          sceneProps={sceneProps}
        />
      </Stb15CanvasShell>

      {showStatus && phase === 'idle' && game && (
        <p className="text-center text-xs text-neutral-500">Swipe right to roll.. it's all in the fingers.</p>
      )}

      {(can2Dice || can1Die) && game && phase !== 'won' && phase !== 'over' && (
        <p className="text-center text-xs text-teal-600 font-medium">
          {can1Die ? 'Tiles 4–15 shut — single die unlocked!' : 'Tiles 10–15 shut — 2-dice mode unlocked!'}
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
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Congratulations!</p>
        <p className="mt-3 text-center text-3xl font-extrabold leading-none text-pink-500">+{pts} POINTS</p>
        <div className="mt-5 rounded-xl bg-neutral-100 px-4 py-3 text-center text-sm font-medium text-neutral-700">
          You shut the box — all 15 tiles!
        </div>
        {typeof balance === 'number' && (
          <p className="mt-4 text-center text-sm text-neutral-600">
            Your balance: <span className="font-semibold text-neutral-900">{balance.toLocaleString()} pts</span>
          </p>
        )}
        <button onClick={onClose} className="mt-6 block w-full rounded-xl bg-teal-300 py-3 text-base font-semibold text-teal-900 transition hover:bg-teal-400 active:scale-95">
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

useGLTF.preload(TWIRL_URL);
useGLTF.preload('/cup.glb');
