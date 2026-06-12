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

// Resting tilt for the floating triangle die — a gentle tilt so it reads
// as a flat plane floating face-on in the window, like the classic 8-ball.
const REST_ROTATION = { x: 0.06, y: -0.1 };

// Slow continuous spin while idle, so the die never looks perfectly still
// — like it's gently turning in the fluid.
const IDLE_SPIN = 0.12;

/* ----------------------------------------------------------------------
 * Window background — flat mid-grey with a soft vignette, matching the
 * classic 8-ball's recessed window. The only colour in the scene is the
 * blue triangle floating inside it.
 * -------------------------------------------------------------------- */
function makeWindowGlowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#3a3a3b');
  grad.addColorStop(0.6, '#2c2c2d');
  grad.addColorStop(1, '#1c1c1d');
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

  // Downward-pointing triangle (one face of the d20), like the classic
  // 8-ball's floating die.
  const triangleGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.58, 0.46);
    shape.lineTo(0.58, 0.46);
    shape.lineTo(0, -0.56);
    shape.lineTo(-0.58, 0.46);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    });
    geo.translate(0, 0, -0.08);
    return geo;
  }, []);

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
        // Only let it idly spin when there's no interactive text on its
        // face — keeps the Movies/Games picker and confirm prompt legible
        // and clickable, while the revealed answer can drift and turn.
        const interactive = phase === 'select' || phase === 'confirm';
        if (!interactive) {
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

      {/* The "inner core" — a faceted blue triangle (one face of the d20)
          that tumbles wildly while shaking and otherwise drifts with a
          slow continuous spin, like the classic 8-ball's die floating in
          its window. Movies/Games/confirm/answer text is printed on its
          face. */}
      <group ref={dieRef} position={[0, 0, 0.92]} rotation={[REST_ROTATION.x, REST_ROTATION.y, 0]}>
        <mesh castShadow geometry={triangleGeo}>
          <meshStandardMaterial color="#1f3fe6" emissive="#2c4dff" emissiveIntensity={0.6} roughness={0.3} metalness={0.1} />
        </mesh>

        {showPicker && (
          <>
            {/* Upper hit zone — Movies & TV */}
            <mesh
              position={[0, 0.22, 0.1]}
              onClick={(e) => { e.stopPropagation(); onPick('movies'); }}
              onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
              onPointerOut={() => setCursor(false)}
            >
              <planeGeometry args={[0.8, 0.3]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Text position={[0, 0.22, 0.105]} fontSize={0.12} color="#eaf6ff" maxWidth={0.8} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.003} outlineColor="#0a1a66">
              Movies
            </Text>

            {/* Lower hit zone — Video Games */}
            <mesh
              position={[0, -0.12, 0.1]}
              onClick={(e) => { e.stopPropagation(); onPick('games'); }}
              onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
              onPointerOut={() => setCursor(false)}
            >
              <planeGeometry args={[0.55, 0.26]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Text position={[0, -0.12, 0.105]} fontSize={0.105} color="#eaf6ff" maxWidth={0.55} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.003} outlineColor="#0a1a66">
              Games
            </Text>
          </>
        )}

        {showConfirm && (
          <>
            <mesh
              position={[0, 0.03, 0.1]}
              onClick={(e) => { e.stopPropagation(); onReroll(); }}
              onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
              onPointerOut={() => setCursor(false)}
            >
              <planeGeometry args={[0.9, 0.7]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Text position={[0, 0.03, 0.105]} fontSize={0.095} lineHeight={1.25} color="#eaf6ff" maxWidth={0.85} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.003} outlineColor="#0a1a66">
              {'Okay, then.\nGive me a shake!'}
            </Text>
          </>
        )}

        {showAnswer && (
          <>
            <mesh
              position={[0, 0.03, 0.1]}
              onClick={(e) => { e.stopPropagation(); onReroll(); }}
              onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
              onPointerOut={() => setCursor(false)}
            >
              <planeGeometry args={[0.9, 0.7]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Text position={[0, 0.03, 0.105]} fontSize={0.105} lineHeight={1.25} color="#eaf6ff" maxWidth={0.85} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.003} outlineColor="#0a1a66">
              {answer}
            </Text>
          </>
        )}
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
