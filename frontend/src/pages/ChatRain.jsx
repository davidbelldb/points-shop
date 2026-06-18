/**
 * ChatRain.jsx — all Three.js / R3F / drei code for the chat media tray.
 * Lazy-imported by MessagesPage so the heavy 3D bundle is only fetched
 * when the user first opens the media tray.
 */
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const DUCK_URL    = '/models/ducks/duck_7.stl';
const DUCK_COLOR  = '#fcba03';
const RAIN_COUNT  = 30;
const RAIN_SPREAD = 1.5;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function SpinningPreview({ object }) {
  const obj = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = 1.9 / Math.max(size.x, size.y, size.z, 0.0001);
    object.scale.setScalar(s);
    object.position.copy(center).multiplyScalar(-s);
    return object;
  }, [object]);
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 1.4; });
  return <group ref={ref}><primitive object={obj} /></group>;
}

function useGoldDuck() {
  const geometry = useLoader(STLLoader, DUCK_URL);
  return useMemo(() => {
    const g = geometry.clone();
    g.computeVertexNormals();
    g.computeBoundingBox();
    const centre = new THREE.Vector3();
    g.boundingBox.getCenter(centre);
    g.translate(-centre.x, -centre.y, -centre.z);
    const material = new THREE.MeshStandardMaterial({ color: DUCK_COLOR, roughness: 0.45, metalness: 0.15 });
    return new THREE.Mesh(g, material);
  }, [geometry]);
}

// ---------------------------------------------------------------------------
// Tray thumbnails
// ---------------------------------------------------------------------------
function TwirlThumb() {
  const { scene } = useGLTF('/twirl.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <SpinningPreview object={clone} />;
}
function PopcornThumb() {
  const { scene } = useGLTF('/popcorn.glb');
  const clone = useMemo(() => scene.clone(true), [scene]);
  return <SpinningPreview object={clone} />;
}
function DuckThumb() {
  const duck = useGoldDuck();
  const oriented = useMemo(() => {
    const m = duck.clone(true);
    m.rotation.x = -Math.PI / 2;
    return m;
  }, [duck]);
  return <SpinningPreview object={oriented} />;
}

function ModelButton({ onClick, disabled, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="shrink-0 rounded-full p-1 transition hover:bg-neutral-100 active:scale-90 disabled:opacity-40 dark:hover:bg-neutral-800"
    >
      <span className="block h-9 w-9">
        <Canvas camera={{ position: [0, 0, 2.6], fov: 45 }} gl={{ alpha: true, antialias: true }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[2, 3, 4]} intensity={1.6} />
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rain overlay
// ---------------------------------------------------------------------------
function RainItems({ template, onDone, count = RAIN_COUNT, spread = RAIN_SPREAD, speedMin = 2.2, speedMax = 4.6 }) {
  const { viewport } = useThree();
  const doneRef = useRef(false);
  const items = useMemo(() => {
    const box = new THREE.Box3().setFromObject(template);
    const size = new THREE.Vector3();
    box.getSize(size);
    const norm = 1 / Math.max(size.x, size.y, size.z, 0.0001);
    return Array.from({ length: count }, () => ({
      obj: template.clone(true),
      x: (Math.random() - 0.5) * viewport.width * 0.95,
      y: viewport.height / 2 + 1 + Math.random() * viewport.height * spread,
      speed: speedMin + Math.random() * (speedMax - speedMin),
      rx: (Math.random() - 0.5) * 3,
      ry: (Math.random() - 0.5) * 3,
      scale: norm * (0.6 + Math.random() * 0.5),
    }));
  }, [template, viewport.width, viewport.height, count, spread, speedMin, speedMax]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    let allBelow = true;
    for (const it of items) {
      it.y -= it.speed * dt;
      it.obj.position.set(it.x, it.y, 0);
      it.obj.rotation.x += it.rx * dt;
      it.obj.rotation.y += it.ry * dt;
      if (it.y > -viewport.height / 2 - 1.5) allBelow = false;
    }
    if (allBelow && !doneRef.current) { doneRef.current = true; onDone?.(); }
  });

  return (
    <group>
      {items.map((it, i) => (
        <primitive key={i} object={it.obj} scale={it.scale} position={[it.x, it.y, 0]} />
      ))}
    </group>
  );
}

function TwirlRainSource({ onDone, ...rest }) {
  const { scene } = useGLTF('/twirl.glb');
  return <RainItems template={scene} onDone={onDone} {...rest} />;
}
function PopcornRainSource({ onDone, ...rest }) {
  const { scene } = useGLTF('/popcorn.glb');
  return <RainItems template={scene} onDone={onDone} {...rest} />;
}
function DuckRainSource({ onDone, ...rest }) {
  const duck = useGoldDuck();
  return <RainItems template={duck} onDone={onDone} {...rest} />;
}

export function RainOverlay({ rain, onDone }) {
  if (!rain) return null;
  const { kind, ...rest } = rain;
  const Source = kind === 'duck' ? DuckRainSource : kind === 'popcorn' ? PopcornRainSource : TwirlRainSource;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <Canvas camera={{ position: [0, 0, 8], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 5, 6]} intensity={1.6} />
        <Suspense fallback={null}>
          <Source onDone={onDone} {...rest} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function RainTrayButtons({ raining, onRain }) {
  return (
    <>
      <ModelButton disabled={!!raining} title="Rain twirls" onClick={() => onRain('twirl')}>
        <TwirlThumb />
      </ModelButton>
      <ModelButton disabled={!!raining} title="Rain popcorn" onClick={() => onRain('popcorn')}>
        <PopcornThumb />
      </ModelButton>
      <ModelButton disabled={!!raining} title="Rain ducks" onClick={() => onRain('duck')}>
        <DuckThumb />
      </ModelButton>
    </>
  );
}
