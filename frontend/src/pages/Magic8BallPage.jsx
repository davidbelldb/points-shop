import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '../lib/api.js';

/* ============================================================================
 * Magic 8-Ball — homepage embed
 * Same Three.js engine / lighting rig as Shut the Box 15 (day-mode values).
 * On load the camera pulls back to reveal the whole ball against a purple
 * backdrop, then glides in on the window. A floating 20-sided "core" die
 * doubles as the Movies/Games picker, asks for a shake to confirm, then the
 * camera pushes in tight on the die to reveal the pick from /watchlist
 * (rewatch) or /playlist. Shake it by scrubbing a finger left-right across
 * the ball, or by physically shaking the phone.
 * ========================================================================== */

const CATEGORIES = {
  movies: { label: 'Movies & TV', icon: '🎬' },
  games: { label: 'Video Games', icon: '🎮' },
};

const SHAKE_DURATION = 1400; // ms — wobble + liquid swirl settle time

// Resting tilt for the floating die — rotated so one specific icosahedron
// facet faces the camera dead-on (its centroid lands at local (0, 0, ~0.49)
// once this rotation is applied). Movies/Games/confirm/answer text is
// anchored to that facet via a small counter-rotated "face group" inside
// the die (see below), so it always reads right-way-up and front-on.
const REST_ROTATION = { x: 0, y: 0.36486382754888896 };

// Slow continuous spin while idle, so the die never looks perfectly still
// — like it's gently turning in the fluid.
const IDLE_SPIN = 0.12;

/* ----------------------------------------------------------------------
 * Window "liquid" — deep dark blue (#0e0e29) filling the whole window,
 * with the faintest lighter glow at the centre for depth. The white die
 * floats in this fluid.
 * -------------------------------------------------------------------- */
function makeWindowGlowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#1a1a3c');
  grad.addColorStop(0.6, '#121230');
  grad.addColorStop(1, '#0e0e29');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ----------------------------------------------------------------------
 * Lighting — matches Stb15Scene's day-mode rig (SceneLighting w/ isNight=false)
 * -------------------------------------------------------------------- */
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.55} color="#ffffff" />
      <directionalLight position={[4, 8, 4]} intensity={1.0} />
      <directionalLight position={[-5, 4, -2]} intensity={0.3} />
      <pointLight position={[-5, 6, -3]} intensity={0.8} color="#88aaff" distance={16} decay={2} />
    </>
  );
}

/* ----------------------------------------------------------------------
 * Camera rig — three resting positions the camera glides between as the
 * phase changes:
 *   intro   — pulled right back, whole ball in shot (reveal moment)
 *   select/
 *   confirm/
 *   shaking — settled on the window, like the original close-up
 *   answer  — stays on the window, same as select/confirm/shaking
 * -------------------------------------------------------------------- */
const CAMERA_TARGETS = {
  intro: { pos: [0, 1.6, 9.5], fov: 42 },
  select: { pos: [0, 0.3, 4], fov: 35 },
  confirm: { pos: [0, 0.3, 4], fov: 35 },
  shaking: { pos: [0, 0.3, 4], fov: 35 },
  answer: { pos: [0, 0.3, 4], fov: 35 },
};

function CameraRig({ phase }) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());

  useFrame(() => {
    const target = CAMERA_TARGETS[phase] || CAMERA_TARGETS.select;
    targetVec.current.set(...target.pos);
    camera.position.lerp(targetVec.current, 0.045);
    camera.fov += (target.fov - camera.fov) * 0.045;
    camera.lookAt(0, 0, 0.6);
    camera.updateProjectionMatrix();
  });

  return null;
}

/* ----------------------------------------------------------------------
 * The ball itself — window houses either the category picker
 * (phase === 'select') or the floating answer (phase === 'answer').
 * -------------------------------------------------------------------- */
function MagicBall({ phase, answer, shakeSeed, onPick, onReroll }) {
  const ballRef = useRef();
  const dieRef = useRef();
  const shakeStartRef = useRef(0);

  const glowTex = useMemo(() => makeWindowGlowTexture(), []);

  useEffect(() => {
    if (shakeSeed) shakeStartRef.current = performance.now();
  }, [shakeSeed]);

  function setCursor(pointer) {
    document.body.style.cursor = pointer ? 'pointer' : '';
  }

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const since = (performance.now() - shakeStartRef.current) / 1000;
    const shaking = since < SHAKE_DURATION / 1000;

    // Ball wobble — still, except for a violent decaying shake on ask
    if (ballRef.current) {
      let wobbleZ = 0;
      let wobbleX = 0;
      if (shaking) {
        const decay = Math.max(0, 1 - since / (SHAKE_DURATION / 1000));
        wobbleZ = Math.sin(since * 34) * 0.32 * decay;
        wobbleX = Math.cos(since * 27) * 0.18 * decay;
      }
      ballRef.current.rotation.z = wobbleZ;
      ballRef.current.rotation.x = wobbleX;
    }

    // Die face — tumbles wildly while shaking, otherwise drifts with a
    // slow continuous spin so it never looks frozen, like it's turning
    // gently in the fluid.
    if (dieRef.current) {
      if (shaking) {
        dieRef.current.rotation.x += delta * 2.6;
        dieRef.current.rotation.y += delta * 3.4;
        dieRef.current.rotation.z += delta * 1.8;
      } else {
        dieRef.current.rotation.x += (REST_ROTATION.x - dieRef.current.rotation.x) * Math.min(delta * 2, 1);
        dieRef.current.rotation.y += (REST_ROTATION.y - dieRef.current.rotation.y) * Math.min(delta * 2, 1);
        // Only let it idly spin during the intro, before any text is on
        // the face — once Movies/Games, the confirm prompt, or the
        // revealed answer is showing, settle rotation.z back to 0 and
        // hold it there so that facet stays square-on to the camera and
        // the text stays right-way-up with no drift.
        if (phase === 'intro') {
          dieRef.current.rotation.z += delta * IDLE_SPIN;
        } else {
          dieRef.current.rotation.z += (0 - dieRef.current.rotation.z) * Math.min(delta * 2, 1);
        }
      }
    }
  });

  const showPicker = phase === 'select';
  const showConfirm = phase === 'confirm';
  const showAnswer = phase === 'answer';

  return (
    <group ref={ballRef}>
      {/* Outer 8-ball shell — a full sphere would entirely hide the window
          contents behind its near (camera-facing) surface, since everything
          in the window sits at a smaller radius than the shell. Cut a
          circular "porthole" out of the front (a polar cap, rotated to
          face +Z/the camera) so the glow, liquid, die and ring are visible. */}
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[1.6, 48, 48, 0, Math.PI * 2, Math.PI / 3, Math.PI - Math.PI / 3]} />
        <meshStandardMaterial color="#0c0c10" roughness={0.18} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Window background — flat mid-grey, the resting colour of the window */}
      <mesh position={[0, 0, 0.7]}>
        <circleGeometry args={[1.06, 48]} />
        <meshBasicMaterial map={glowTex} depthWrite={false} />
      </mesh>

      {/* Double ring inset around the window, like the real 8-ball's
          recessed window lip. */}
      <mesh position={[0, 0, 0.78]}>
        <torusGeometry args={[1.02, 0.018, 12, 48]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.76]}>
        <torusGeometry args={[0.94, 0.012, 12, 48]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.4} metalness={0.2} />
      </mesh>

      {/* The "inner core" — a white 20-sided die that tumbles wildly while
          shaking and otherwise drifts with a slow continuous spin, like a
          d20 floating in the deep blue liquid. */}
      <group ref={dieRef} position={[0, 0, 0.85]} rotation={[REST_ROTATION.x, REST_ROTATION.y, 0]} scale={0.67}>
        <mesh castShadow>
          <icosahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial color="#f5f5f0" roughness={0.4} metalness={0.05} flatShading />
        </mesh>
        {/* Faint edge highlight so the facets read clearly */}
        <mesh scale={1.01}>
          <icosahedronGeometry args={[0.62, 0]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.25} depthWrite={false} />
        </mesh>

        {/* "Face group" — sits flush on one specific facet (its centroid,
            nudged outward along the face normal) with a counter-rotation
            that exactly cancels REST_ROTATION, plus an extra -90° spin
            about the viewing axis so this facet's triangle sits with a
            horizontal edge at the bottom and its apex at the top (like the
            reference). Movies/Games/confirm/answer text lives inside this
            group so it always renders flat, front-on, right-way-up and
            centred on that one facet, regardless of how the die itself is
            tilted. Because of the extra -90° spin, a child's local
            position (px, py) lands on screen at (py, -px) — so to place
            text at screen position (X, Y) we set position={[-Y, X, Z]}.
            Each <Text> also gets rotation={[0,0,Math.PI/2]} to cancel that
            same spin so the glyphs themselves stay upright. */}
        <group position={[-0.1901, 0, 0.4977]} rotation={[0, -0.36486382754888896, -Math.PI / 2]}>
          {showPicker && (
            <>
              {/* Upper hit zone — Movies & TV (screen pos 0, 0.05) */}
              <mesh
                position={[-0.05, 0, 0.03]}
                onClick={(e) => { e.stopPropagation(); onPick('movies'); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.18, 0.4]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[-0.05, 0, 0.04]} rotation={[0, 0, Math.PI / 2]} fontSize={0.085} color="#23264a" maxWidth={0.4} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0025} outlineColor="#ffffff">
                Movies
              </Text>

              {/* Lower hit zone — Video Games (screen pos 0, -0.15) */}
              <mesh
                position={[0.15, 0, 0.03]}
                onClick={(e) => { e.stopPropagation(); onPick('games'); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.18, 0.55]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[0.15, 0, 0.04]} rotation={[0, 0, Math.PI / 2]} fontSize={0.08} color="#23264a" maxWidth={0.55} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0025} outlineColor="#ffffff">
                Games
              </Text>
            </>
          )}

          {showConfirm && (
            <>
              {/* screen pos (0, -0.05) */}
              <mesh
                position={[0.05, 0, 0.03]}
                onClick={(e) => { e.stopPropagation(); onReroll(); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.35, 0.46]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[0.05, 0, 0.04]} rotation={[0, 0, Math.PI / 2]} fontSize={0.058} lineHeight={1.25} color="#23264a" maxWidth={0.46} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.002} outlineColor="#ffffff">
                {'Okay, then.\nGive me a shake!'}
              </Text>
            </>
          )}

          {showAnswer && (
            <>
              {/* screen pos (0, -0.05) */}
              <mesh
                position={[0.05, 0, 0.03]}
                onClick={(e) => { e.stopPropagation(); onReroll(); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.35, 0.48]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[0.05, 0, 0.04]} rotation={[0, 0, Math.PI / 2]} fontSize={0.064} lineHeight={1.25} color="#23264a" maxWidth={0.48} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.002} outlineColor="#ffffff">
                {answer}
              </Text>
            </>
          )}
        </group>
      </group>

      {/* Heading prompt — fixed in the window, not on the die */}
      {showPicker && (
        <Text position={[0, 0.62, 1.0]} fontSize={0.078} lineHeight={1.15} color="#fdf6e3" maxWidth={1.35} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#0a0a14">
          {'Need Help Choosing\na Movie or Game?'}
        </Text>
      )}

      {/* Glass tint */}
      <mesh position={[0, 0, 1.46]}>
        <circleGeometry args={[1.08, 48]} />
        <meshStandardMaterial color="#0d1733" roughness={0.1} metalness={0.1} transparent opacity={0.12} depthWrite={false} />
      </mesh>

      {/* Window ring */}
      <mesh position={[0, 0, 1.5]}>
        <torusGeometry args={[1.08, 0.12, 16, 48]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.3} metalness={0.45} />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------------------------
 * Canvas shell + gesture surface
 * -------------------------------------------------------------------- */
function Magic8BallCanvas({ phase, answer, shakeSeed, onPick, onReroll, onShakeGesture, onFirstInteract }) {
  const swipeRef = useRef({ active: false, lastX: 0, lastDir: 0, accum: 0, lastT: 0 });

  function resetSwipe() {
    swipeRef.current = { active: false, lastX: 0, lastDir: 0, accum: 0, lastT: 0 };
  }

  function handlePointerDown(e) {
    swipeRef.current = { active: true, lastX: e.clientX, lastDir: 0, accum: 0, lastT: performance.now() };
    // Piggyback the iOS motion-permission prompt onto the very first tap —
    // requestPermission() must be called from inside a user gesture, so
    // this is the earliest point we can ask without a dedicated button.
    onFirstInteract?.();
  }

  function handlePointerMove(e) {
    const s = swipeRef.current;
    if (!s.active) return;
    const dx = e.clientX - s.lastX;
    if (Math.abs(dx) < 1) return;
    const dir = dx > 0 ? 1 : -1;
    // Reversing direction quickly = "scrubbing" — accumulate energy
    if (s.lastDir !== 0 && dir !== s.lastDir) {
      s.accum += Math.abs(dx);
    } else {
      s.accum += Math.abs(dx) * 0.3;
    }
    s.lastDir = dir;
    s.lastX = e.clientX;
    const now = performance.now();
    if (s.accum > 260 && now - s.lastT > 50) {
      s.accum = 0;
      s.lastT = now;
      onShakeGesture?.();
    }
  }

  return (
    <div
      className="touch-none overflow-hidden rounded-2xl shadow-lg"
      style={{
        aspectRatio: '4 / 3',
        background: 'radial-gradient(circle at 50% 38%, #b34bf0 0%, #7a1fc9 35%, #4a1078 65%, #1c0a35 100%)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={resetSwipe}
      onPointerLeave={resetSwipe}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: CAMERA_TARGETS.intro.pos, fov: CAMERA_TARGETS.intro.fov }} gl={{ antialias: true, alpha: true }}>
        <SceneLighting />
        <CameraRig phase={phase} />
        <MagicBall phase={phase} answer={answer} shakeSeed={shakeSeed} onPick={onPick} onReroll={onReroll} />
      </Canvas>
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Playable widget
 * -------------------------------------------------------------------- */
export function Magic8BallGame() {
  const [lists, setLists] = useState({ movies: [], games: [] });
  // 'intro' (camera pulls back to reveal the ball) -> 'select' (pick a
  // category) -> 'confirm' (shake to ask) -> 'shaking' -> 'answer' (camera
  // pushes in on the die to reveal the pick).
  const [phase, setPhase] = useState('intro');
  const [answer, setAnswer] = useState('');
  const [shakeSeed, setShakeSeed] = useState(0);
  const [motionSupported, setMotionSupported] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const categoryRef = useRef('movies');
  const busyRef = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    api.rewatchList().then((rows) => {
      if (!Array.isArray(rows)) return;
      const unwatched = rows.filter((r) => !r.watched).map((r) => r.title).filter(Boolean);
      const all = rows.map((r) => r.title).filter(Boolean);
      setLists((l) => ({ ...l, movies: unwatched.length ? unwatched : all }));
    }).catch(() => {});
    api.playlistList().then((rows) => {
      if (!Array.isArray(rows)) return;
      const unplayed = rows.filter((r) => !r.played).map((r) => r.title).filter(Boolean);
      const all = rows.map((r) => r.title).filter(Boolean);
      setLists((l) => ({ ...l, games: unplayed.length ? unplayed : all }));
    }).catch(() => {});
  }, []);

  // Intro: camera pulls back to show the whole ball on load, then settles
  // in on the window and reveals the category picker.
  useEffect(() => {
    const id = setTimeout(() => setPhase((p) => (p === 'intro' ? 'select' : p)), 2200);
    return () => clearTimeout(id);
  }, []);

  // iOS 13+ gates devicemotion behind an explicit DeviceMotionEvent
  // .requestPermission() call, which must run inside a user gesture. The
  // auto-request on first tap (handleFirstInteract) covers most cases, but
  // some browsers ignore/ silently reject that implicit attempt — so when
  // permission is still needed, show an explicit "Enable shake" button as
  // a reliable fallback.
  useEffect(() => {
    setMotionSupported(
      typeof window !== 'undefined' &&
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    );
  }, []);

  function rollFor(category) {
    if (busyRef.current) return;
    busyRef.current = true;
    categoryRef.current = category;
    setPhase('shaking');
    setShakeSeed((s) => s + 1);
    setTimeout(() => {
      const list = lists[category] || [];
      if (list.length === 0) {
        setAnswer(`Your ${CATEGORIES[category].label} list is empty!`);
      } else {
        setAnswer(list[Math.floor(Math.random() * list.length)]);
      }
      setPhase('answer');
      busyRef.current = false;
    }, SHAKE_DURATION);
  }

  function handlePick(category) {
    if (busyRef.current) return;
    categoryRef.current = category;
    setPhase('confirm');
  }

  function handleReroll() {
    if (busyRef.current) return;
    // Tap the prompt/answer to go back and pick a different category
    setPhase('select');
  }

  function handleShakeGesture() {
    if (busyRef.current) return;
    // Shake only does something once a category's been picked (or we
    // already have an answer to re-roll).
    if (phaseRef.current !== 'confirm' && phaseRef.current !== 'answer') return;
    rollFor(categoryRef.current);
  }

  // Physical device shake — Android (and desktop testing tools) fire
  // devicemotion without any permission prompt. iOS 13+ requires a
  // user-gesture permission request, handled by enableMotion().
  useEffect(() => {
    if (!motionEnabled) return;
    let lastShake = 0;
    const THRESHOLD = 18; // m/s^2 of combined acceleration delta
    let last = null;

    function onMotion(e) {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      if (last) {
        const delta =
          Math.abs((acc.x || 0) - last.x) +
          Math.abs((acc.y || 0) - last.y) +
          Math.abs((acc.z || 0) - last.z);
        const now = performance.now();
        if (delta > THRESHOLD && now - lastShake > 1200) {
          lastShake = now;
          handleShakeGesture();
        }
      }
      last = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };
    }

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionEnabled]);

  const motionRequestedRef = useRef(false);

  async function enableMotion() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const result = await DeviceMotionEvent.requestPermission();
        if (result === 'granted') setMotionEnabled(true);
      } else {
        // Android / browsers that don't gate devicemotion behind permission
        setMotionEnabled(true);
      }
    } catch {
      // Permission denied or unsupported — scrub/swipe gesture still works
    }
  }

  // Auto-request device-motion permission on the very first touch/click on
  // the ball, so there's no separate "Enable shake" button to tap. On iOS
  // this still needs to happen inside a user gesture (hence wiring it to
  // pointerdown); on Android/desktop it just silently enables.
  function handleFirstInteract() {
    if (motionRequestedRef.current || motionEnabled) return;
    motionRequestedRef.current = true;
    enableMotion();
  }

  return (
    <div className="space-y-3">
      <Magic8BallCanvas
        phase={phase}
        answer={answer}
        shakeSeed={shakeSeed}
        onPick={handlePick}
        onReroll={handleReroll}
        onShakeGesture={handleShakeGesture}
        onFirstInteract={handleFirstInteract}
      />

      <p className="text-center text-xs text-neutral-400">
        {phase === 'intro'
          ? 'Concentrate…'
          : phase === 'select'
            ? 'Tap Movies or Games in the window.'
            : phase === 'confirm'
              ? 'Shake the ball — or scrub the screen — for your answer.'
              : phase === 'shaking'
                ? 'Shaking…'
                : 'Tap the answer to ask again, or shake the ball for another.'}
        {motionSupported && !motionEnabled && (
          <>
            {' '}
            <button
              type="button"
              onClick={enableMotion}
              className="ml-1 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              title="Enable shake-to-ask"
            >
              📳 Enable shake
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/* ============================================================================
 * Standalone routed page — /magic-8-ball
 * ========================================================================== */
export default function Magic8BallPage() {
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Magic 8-Ball</h1>
        <span className="w-10" />
      </div>
      <Magic8BallGame />
    </div>
  );
}
