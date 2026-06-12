import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { api } from '../lib/api.js';
import { useSettings } from '../lib/SettingsContext.jsx';

// Parse a settings value (always a string, or undefined) to a finite number,
// falling back to a default when missing/invalid.
function num(v, fallback) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

// Overwrite the per-vertex colour of one face (3 vertices) of a flat-shaded
// BufferGeometry, used to fade the die's result facet between its "hidden"
// and "revealed" colours.
function setFaceColor(geo, faceIndex, color) {
  const colorAttr = geo.attributes.color;
  for (let v = 0; v < 3; v++) {
    const idx = faceIndex * 3 + v;
    colorAttr.setXYZ(idx, color.r, color.g, color.b);
  }
  colorAttr.needsUpdate = true;
}

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
// facet faces the camera dead-on AND that facet's triangle sits apex-up,
// base-down on screen (its centroid lands at local (0, 0, ~0.49) once this
// rotation is applied). Movies/Games/confirm/answer text is anchored to
// that facet via a small counter-rotated "face group" inside the die (see
// below), so it always reads right-way-up and front-on.
const REST_ROTATION = { x: 0.36486382754888896, y: 0 };
const REST_Z = -Math.PI / 2;

// Slow continuous spin while idle, so the die never looks perfectly still
// — like it's gently turning in the fluid.
const IDLE_SPIN = 0.12;

// ---------------------------------------------------------------------
// Tunable scene settings — change these to restyle, reposition or
// recolour the ball without hunting through the JSX below.
// ---------------------------------------------------------------------
// Radial gradient behind the whole 8-ball — deep near-black liquid glow at
// the centre (#05050c, reaching full strength at 50% of the way out) fading
// to near-black (#02041c) at the edges.
const SCENE_BACKGROUND = 'radial-gradient(circle, #05050c 50%, #02041c 100%)';

// Default camera position/fov once settled on the window, and default
// lighting rig — both overridable from Admin > Magic 8-Ball (stored as
// settings; these are the fallbacks when no override is saved).
const DEFAULT_CAMERA_VIEW = { pos: [0, 0.3, 4], fov: 35 };
const DEFAULT_LIGHTING = {
  ambientIntensity: 0.55,
  ambientColor: '#ffffff',
  dir1Intensity: 1.0,
  dir2Intensity: 0.3,
  pointIntensity: 0.8,
  pointColor: '#88aaff',
};
const TEXT_COLOR = '#b7b7f7';                      // Movies/Games/confirm/answer text on the die face
const RESULT_FACE_COLOR = '#100c7f';               // the die's "result" facet colour once revealed
const RESULT_FACE_REST_COLOR = '#05050c';          // result facet colour while tumbling/settling — hidden in the liquid
const DIE_SCALE = 0.67 * 1.33;                     // 33% bigger than the original 0.67
const WINDOW_SCALE = 1;                            // window/portal elements at full size (shrink reverted — was creating a nested "second ball" look)
const WINDOW_FILL_COLOR = '#000000';               // flat "liquid" fill inside the 8-ball window — solid black

// ---------------------------------------------------------------------
// Appearance defaults — overridable from Admin > Magic 8-Ball (stored as
// settings; these are the fallbacks when no override is saved).
// ---------------------------------------------------------------------
const DEFAULT_DIE_DEPTH = 0.85;                    // icosahedron resting depth, deep in the liquid
const DIE_FLOAT_OFFSET = 0.3;                      // how much further forward the die floats once the result settles, relative to its resting depth
const DEFAULT_RESULT_FACE_POP = 0;                 // extra outward offset for just the result facet (face 6), along its own normal — a "pop out" relief effect
const DEFAULT_FILTER_COLOR = '#000000';            // murky liquid filter drawn over the window — black, so only the result face's own colour reads through
const DEFAULT_FILTER_OPACITY = 0.45;
const DEFAULT_FILTER_DEPTH = 1.0;
const DEFAULT_QUESTION_TITLE = 'Need Help Choosing\na Movie or Game?';
const DEFAULT_QUESTION_COLOR = '#fdf6e3';
const DEFAULT_QUESTION_OPACITY = 1;
const DEFAULT_QUESTION_DEPTH = 1.0;

// Fixed duration (ms) the die's settle animation is assumed to take once
// shaking stops — used purely to time the result-face/answer-text reveal
// fade so it can be set to finish exactly when the die comes to rest.
const SETTLE_DURATION_MS = 900;
const DEFAULT_REVEAL_LEAD_MS = 500;                // "timing before end" — fade-in plays during the last this-many ms of the settle, ending exactly when it stops

/* ----------------------------------------------------------------------
 * Lighting — matches Stb15Scene's day-mode rig (SceneLighting w/ isNight=false)
 * by default, but ambient/directional/point intensities and colours are
 * tunable from Admin > Magic 8-Ball.
 * -------------------------------------------------------------------- */
function SceneLighting({ lighting }) {
  return (
    <>
      <ambientLight intensity={lighting.ambientIntensity} color={lighting.ambientColor} />
      <directionalLight position={[4, 8, 4]} intensity={lighting.dir1Intensity} />
      <directionalLight position={[-5, 4, -2]} intensity={lighting.dir2Intensity} />
      <pointLight position={[-5, 6, -3]} intensity={lighting.pointIntensity} color={lighting.pointColor} distance={16} decay={2} />
      {/* Warm "lamp" accent — a cosy amber glow from one side, paired with a
          cool blue accent from the other for contrast. */}
      <pointLight position={[4, 2.5, 3]} intensity={0.9} color="#ffb066" distance={14} decay={2} />
      <pointLight position={[-4, 1.5, 2.5]} intensity={0.7} color="#4d8cff" distance={14} decay={2} />
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
const INTRO_CAMERA = { pos: [0, 1.6, 9.5], fov: 42 };

// Two-finger pinch zoom multiplies the target FOV by this factor — values
// below 1 zoom in (narrower FOV), above 1 zoom out (wider FOV).
const MIN_PINCH_ZOOM = 0.5;
const MAX_PINCH_ZOOM = 1.8;

// Two-finger drag (without pinching) orbits the camera around the ball.
// Sensitivity is radians of orbit per pixel of drag; elevation is clamped
// so the camera can't flip over the top/bottom of the ball.
const ORBIT_SENSITIVITY = 0.006;
const MAX_ORBIT_ELEVATION = 1.1;

// Point the camera orbits/looks around — the centre of the 8-ball window.
const LOOK_AT = new THREE.Vector3(0, 0, 0.6);
const ORBIT_AXIS_Y = new THREE.Vector3(0, 1, 0);
const ORBIT_AXIS_X = new THREE.Vector3(1, 0, 0);

function CameraRig({ phase, cameraView, zoomRef, orbitRef }) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3());

  useFrame(() => {
    const target = phase === 'intro' ? INTRO_CAMERA : cameraView;
    const zoom = zoomRef?.current ?? 1;
    const orbit = orbitRef?.current ?? { az: 0, el: 0 };

    targetVec.current.set(...target.pos).sub(LOOK_AT);
    if (orbit.az) targetVec.current.applyAxisAngle(ORBIT_AXIS_Y, orbit.az);
    if (orbit.el) targetVec.current.applyAxisAngle(ORBIT_AXIS_X, orbit.el);
    targetVec.current.add(LOOK_AT);

    camera.position.lerp(targetVec.current, 0.045);
    camera.fov += (target.fov * zoom - camera.fov) * 0.045;
    camera.lookAt(LOOK_AT);
    camera.updateProjectionMatrix();
  });

  return null;
}

/* ----------------------------------------------------------------------
 * The ball itself — window houses either the category picker
 * (phase === 'select') or the floating answer (phase === 'answer').
 * -------------------------------------------------------------------- */
function MagicBall({ phase, answer, shakeSeed, onPick, onReroll, appearance }) {
  const ballRef = useRef();
  const dieRef = useRef();
  const shakeStartRef = useRef(0);

  // Result-facet colour reveal — stays RESULT_FACE_REST_COLOR (blends into
  // the liquid) while tumbling/settling, then transitions smoothly to
  // RESULT_FACE_COLOR only once the die has fully come to rest.
  const restFaceColor = useRef(new THREE.Color(RESULT_FACE_REST_COLOR));
  const litFaceColor = useRef(new THREE.Color(RESULT_FACE_COLOR));
  const faceColorScratch = useRef(new THREE.Color());
  const faceRevealRef = useRef(0); // 0 = rest colour/invisible text, 1 = fully revealed
  const shakeEndRef = useRef(null); // timestamp shaking last stopped, or null while shaking
  const answerTextRef = useRef(null); // troika Text instance for the answer, faded with faceRevealRef

  // The die's own geometry — an icosahedron with one facet (face 6, the
  // one that's face-on to the camera once REST_ROTATION is applied)
  // painted a touch lighter via per-vertex colours, so that one facet
  // reads as "the face that's landed" with no extra geometry layered on
  // top. Movies/Games/confirm/answer text is anchored to that same facet
  // via the face group below.
  const dieGeo = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(0.62, 0);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color('#13132c');
    const lit = new THREE.Color(RESULT_FACE_REST_COLOR);
    for (let i = 0; i < count; i++) {
      const face = Math.floor(i / 3);
      const c = face === 6 ? lit : base;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // "Pop out" the result facet (face 6, vertex indices 18-20) — push its
    // 3 vertices outward along the face's own normal, so it sits proud of
    // (positive values) or recessed into (negative values) the rest of the
    // die, like a raised/lowered relief panel. For a regular icosahedron
    // centred at the origin, the direction from the origin to a face's
    // centroid IS that face's outward normal.
    const pop = appearance?.resultFacePop ?? 0;
    if (pop) {
      const posAttr = geo.attributes.position;
      const idxs = [18, 19, 20];
      const verts = idxs.map((i) => new THREE.Vector3().fromBufferAttribute(posAttr, i));
      const normal = verts[0].clone().add(verts[1]).add(verts[2]).normalize();
      for (let k = 0; k < idxs.length; k++) {
        const v = verts[k].addScaledVector(normal, pop);
        posAttr.setXYZ(idxs[k], v.x, v.y, v.z);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
    }
    return geo;
  }, [appearance?.resultFacePop]);

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
          dieRef.current.rotation.z += (REST_Z - dieRef.current.rotation.z) * Math.min(delta * 2, 1);
        }
      }

      // Once the result face has settled, the die drifts forward —
      // floating up through the deep liquid to sit close against the
      // glass, so the result reads through the murky filter below.
      const dieDepth = appearance?.dieDepth ?? DEFAULT_DIE_DEPTH;
      const targetZ = phase === 'answer' ? dieDepth + DIE_FLOAT_OFFSET : dieDepth;
      dieRef.current.position.z += (targetZ - dieRef.current.position.z) * Math.min(delta * 1.5, 1);

      // Result-face colour reveal — tracks the moment shaking stops
      // (shakeEndRef), and treats the die's settle animation as taking a
      // fixed SETTLE_DURATION_MS from that point. The reveal fade — facet
      // colour from RESULT_FACE_REST_COLOR to RESULT_FACE_COLOR, and the
      // answer text's opacity from 0 to 1 — plays during the last
      // `revealLeadMs` of that window, so it finishes exactly when the die
      // comes to rest. Only applies once an answer is showing; any other
      // time the facet stays the dark "hidden" colour and the text stays
      // invisible.
      if (shaking) {
        shakeEndRef.current = null;
      } else if (shakeEndRef.current === null) {
        shakeEndRef.current = performance.now();
      }

      const revealLeadMs = appearance?.revealLeadMs ?? DEFAULT_REVEAL_LEAD_MS;
      let revealTarget = 0;
      if (phase === 'answer' && shakeEndRef.current !== null) {
        const elapsed = performance.now() - shakeEndRef.current;
        revealTarget = revealLeadMs > 0
          ? (elapsed - (SETTLE_DURATION_MS - revealLeadMs)) / revealLeadMs
          : (elapsed >= SETTLE_DURATION_MS ? 1 : 0);
        revealTarget = Math.min(1, Math.max(0, revealTarget));
      }

      if (faceRevealRef.current !== revealTarget) {
        faceRevealRef.current = revealTarget;
        const c = faceColorScratch.current
          .copy(restFaceColor.current)
          .lerp(litFaceColor.current, faceRevealRef.current);
        setFaceColor(dieGeo, 6, c);
        if (answerTextRef.current) {
          answerTextRef.current.fillOpacity = faceRevealRef.current;
          answerTextRef.current.outlineOpacity = faceRevealRef.current;
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

      {/* Window background — flat deep-liquid fill, the resting colour of the window */}
      <mesh position={[0, 0, 0.7]}>
        <circleGeometry args={[1.06 * WINDOW_SCALE, 48]} />
        <meshBasicMaterial color={WINDOW_FILL_COLOR} depthWrite={false} />
      </mesh>

      {/* Double ring inset around the window, like the real 8-ball's
          recessed window lip. */}
      <mesh position={[0, 0, 0.78]}>
        <torusGeometry args={[1.02 * WINDOW_SCALE, 0.018 * WINDOW_SCALE, 12, 48]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.76]}>
        <torusGeometry args={[0.94 * WINDOW_SCALE, 0.012 * WINDOW_SCALE, 12, 48]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.4} metalness={0.2} />
      </mesh>

      {/* The "inner core" — a 20-sided die that tumbles wildly while
          shaking, otherwise drifts with a slow continuous spin. Most of
          its faces are kept close to the liquid colour so the die stays
          mostly hidden in the dark fluid — only face 6 (painted lighter in
          dieGeo) reads clearly, like that one facet has floated face-up
          against the glass. */}
      <group ref={dieRef} position={[0, 0, appearance?.dieDepth ?? DEFAULT_DIE_DEPTH]} rotation={[REST_ROTATION.x, REST_ROTATION.y, REST_Z]} scale={DIE_SCALE}>
        <mesh castShadow geometry={dieGeo}>
          <meshStandardMaterial vertexColors roughness={1} metalness={0} flatShading />
        </mesh>

        {/* "Face group" — sits flush on one specific facet (its centroid,
            nudged outward along the face normal) with a counter-rotation
            that, combined with REST_ROTATION (now {x: ~21°, z: -90°}),
            renders this facet's triangle apex-up, base-down on screen —
            matching the reference. Movies/Games/confirm/answer text lives
            inside this group so it always renders flat, front-on,
            right-way-up and centred on that one facet, regardless of how
            the die itself is tilted. The net transform still works out to
            a -90° spin about the viewing axis, so a child's local position
            (px, py) lands on screen at (py, -px) — to place text at screen
            position (X, Y) we set position={[-Y, X, Z]}. Each <Text> also
            gets rotation={[0,0,Math.PI/2]} to cancel that same spin so the
            glyphs themselves stay upright. */}
        <group position={[-0.1901, 0, 0.4977]} rotation={[0, -0.36486382754888896, 0]}>
          {showPicker && (
            <>
              {/* Upper hit zone — Movies & TV (screen pos 0, 0.06) */}
              <mesh
                position={[-0.06, 0, 0.045]}
                onClick={(e) => { e.stopPropagation(); onPick('movies'); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.16, 0.38]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[-0.06, 0, 0.055]} rotation={[0, 0, Math.PI / 2]} fontSize={0.08} color={TEXT_COLOR} maxWidth={0.38} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0015} outlineColor="#0a0a20">
                Movies
              </Text>

              {/* Lower hit zone — Video Games (screen pos 0, -0.12) */}
              <mesh
                position={[0.12, 0, 0.045]}
                onClick={(e) => { e.stopPropagation(); onPick('games'); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.18, 0.55]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[0.12, 0, 0.055]} rotation={[0, 0, Math.PI / 2]} fontSize={0.08} color={TEXT_COLOR} maxWidth={0.55} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0015} outlineColor="#0a0a20">
                Games
              </Text>
            </>
          )}

          {showConfirm && (
            <>
              {/* screen pos (0, -0.05) */}
              <mesh
                position={[0.05, 0, 0.045]}
                onClick={(e) => { e.stopPropagation(); onReroll(); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.35, 0.46]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text position={[0.05, 0, 0.055]} rotation={[0, 0, Math.PI / 2]} fontSize={0.058} lineHeight={1.25} color={TEXT_COLOR} maxWidth={0.46} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0015} outlineColor="#0a0a20">
                {'Okay, then.\nGive me a shake!'}
              </Text>
            </>
          )}

          {showAnswer && (
            <>
              {/* screen pos (0, -0.05) */}
              <mesh
                position={[0.05, 0, 0.045]}
                onClick={(e) => { e.stopPropagation(); onReroll(); }}
                onPointerOver={(e) => { e.stopPropagation(); setCursor(true); }}
                onPointerOut={() => setCursor(false)}
              >
                <planeGeometry args={[0.35, 0.48]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text ref={answerTextRef} position={[0.05, 0, 0.055]} rotation={[0, 0, Math.PI / 2]} fontSize={0.064} fontWeight="bold" lineHeight={1.25} color={TEXT_COLOR} maxWidth={0.48} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.0015} outlineColor="#0a0a20" fillOpacity={0} outlineOpacity={0}>
                {answer}
              </Text>
            </>
          )}
        </group>
      </group>

      {/* Heading prompt — fixed in the window, not on the die */}
      {showPicker && (
        <Text position={[0, 0.62 * WINDOW_SCALE, appearance?.questionDepth ?? DEFAULT_QUESTION_DEPTH]} fontSize={0.078 * WINDOW_SCALE} lineHeight={1.15} color={appearance?.questionColor ?? DEFAULT_QUESTION_COLOR} fillOpacity={appearance?.questionOpacity ?? DEFAULT_QUESTION_OPACITY} maxWidth={1.35 * WINDOW_SCALE} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.004 * WINDOW_SCALE} outlineColor="#0a0a14" outlineOpacity={appearance?.questionOpacity ?? DEFAULT_QUESTION_OPACITY}>
          {appearance?.questionTitle ?? DEFAULT_QUESTION_TITLE}
        </Text>
      )}

      {/* Murky liquid filter — a near-opaque tinted pane sitting in front
          of the die at rest but behind the glass. The die's far half sits
          behind this and reads as dim and murky; as it floats forward
          toward the die's "result face depth", more of the result facet
          pokes in front of the filter and reads clearly, like it's risen
          up against the glass through the fluid. */}
      <mesh position={[0, 0, appearance?.filterDepth ?? DEFAULT_FILTER_DEPTH]}>
        <circleGeometry args={[1.06 * WINDOW_SCALE, 48]} />
        <meshBasicMaterial color={appearance?.filterColor ?? DEFAULT_FILTER_COLOR} transparent opacity={appearance?.filterOpacity ?? DEFAULT_FILTER_OPACITY} depthWrite={false} />
      </mesh>

      {/* Glass tint */}
      <mesh position={[0, 0, 1.46]}>
        <circleGeometry args={[1.08 * WINDOW_SCALE, 48]} />
        <meshStandardMaterial color="#0d1733" roughness={0.1} metalness={0.1} transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ----------------------------------------------------------------------
 * Canvas shell + gesture surface
 * -------------------------------------------------------------------- */
function Magic8BallCanvas({ phase, answer, shakeSeed, onPick, onReroll, onShakeGesture, onFirstInteract, cameraView, lighting, appearance }) {
  const swipeRef = useRef({ active: false, lastX: 0, lastDir: 0, accum: 0, lastT: 0 });
  // Tracks active touch points by pointerId, plus pinch/orbit state, so a
  // two-finger gesture can zoom (pinch apart/together) and orbit (drag
  // together) the camera without triggering swipes.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef({ active: false, startDist: 0, startZoom: 1, startCentroid: { x: 0, y: 0 }, startOrbit: { az: 0, el: 0 } });
  const multiTouchRef = useRef(false);
  const zoomRef = useRef(1);
  const orbitRef = useRef({ az: 0, el: 0 });
  // Single-finger tap tracking, for double-tap-to-reset.
  const downRef = useRef({ time: 0, x: 0, y: 0 });
  const tapRef = useRef({ time: 0, x: 0, y: 0 });

  function resetSwipe() {
    swipeRef.current = { active: false, lastX: 0, lastDir: 0, accum: 0, lastT: 0 };
  }

  function resetCamera() {
    orbitRef.current = { az: 0, el: 0 };
    zoomRef.current = 1;
  }

  function pinchDistance() {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pinchCentroid() {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return { x: 0, y: 0 };
    const [a, b] = pts;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function handlePointerDown(e) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downRef.current = { time: performance.now(), x: e.clientX, y: e.clientY };

    if (pointersRef.current.size >= 2) {
      // A second finger landed — start (or restart) the pinch/orbit and
      // cancel any in-progress swipe so the gestures don't fight.
      multiTouchRef.current = true;
      resetSwipe();
      pinchRef.current = {
        active: true,
        startDist: pinchDistance(),
        startZoom: zoomRef.current,
        startCentroid: pinchCentroid(),
        startOrbit: { ...orbitRef.current },
      };
      return;
    }
    swipeRef.current = { active: true, lastX: e.clientX, lastDir: 0, accum: 0, lastT: performance.now() };
    // Piggyback the iOS motion-permission prompt onto the very first tap —
    // requestPermission() must be called from inside a user gesture, so
    // this is the earliest point we can ask without a dedicated button.
    onFirstInteract?.();
  }

  function handlePointerMove(e) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchRef.current.active && pointersRef.current.size >= 2) {
      // Pinching apart/together zooms...
      const dist = pinchDistance();
      if (dist > 0 && pinchRef.current.startDist > 0) {
        const scale = pinchRef.current.startDist / dist;
        const next = pinchRef.current.startZoom * scale;
        zoomRef.current = Math.min(MAX_PINCH_ZOOM, Math.max(MIN_PINCH_ZOOM, next));
      }
      // ...while dragging both fingers together orbits the camera.
      const centroid = pinchCentroid();
      const dx = centroid.x - pinchRef.current.startCentroid.x;
      const dy = centroid.y - pinchRef.current.startCentroid.y;
      orbitRef.current = {
        az: pinchRef.current.startOrbit.az - dx * ORBIT_SENSITIVITY,
        el: Math.min(
          MAX_ORBIT_ELEVATION,
          Math.max(-MAX_ORBIT_ELEVATION, pinchRef.current.startOrbit.el - dy * ORBIT_SENSITIVITY)
        ),
      };
      return;
    }

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

  function handlePointerUp(e) {
    // A "simple tap" is a single finger that was never part of a
    // multi-touch gesture this whole press.
    const wasSimpleTap = pointersRef.current.size === 1 && !multiTouchRef.current;

    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current.active = false;
    }
    if (pointersRef.current.size === 0) {
      multiTouchRef.current = false;
    }

    if (wasSimpleTap) {
      const now = performance.now();
      const duration = now - downRef.current.time;
      const moved = Math.hypot(e.clientX - downRef.current.x, e.clientY - downRef.current.y);
      if (duration < 300 && moved < 12) {
        const sinceLastTap = now - tapRef.current.time;
        const tapDist = Math.hypot(e.clientX - tapRef.current.x, e.clientY - tapRef.current.y);
        if (sinceLastTap < 350 && tapDist < 40) {
          // Double-tap — reset orbit + zoom back to the configured view.
          resetCamera();
          tapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          tapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
      } else {
        tapRef.current = { time: 0, x: 0, y: 0 };
      }
    } else {
      tapRef.current = { time: 0, x: 0, y: 0 };
    }

    resetSwipe();
  }

  return (
    <div
      className="touch-none overflow-hidden rounded-2xl shadow-lg"
      style={{
        aspectRatio: '4 / 3',
        background: SCENE_BACKGROUND,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: INTRO_CAMERA.pos, fov: INTRO_CAMERA.fov }} gl={{ antialias: true, alpha: true }}>
        <SceneLighting lighting={lighting} />
        <CameraRig phase={phase} cameraView={cameraView} zoomRef={zoomRef} orbitRef={orbitRef} />
        <MagicBall phase={phase} answer={answer} shakeSeed={shakeSeed} onPick={onPick} onReroll={onReroll} appearance={appearance} />
      </Canvas>
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Playable widget
 * -------------------------------------------------------------------- */
export function Magic8BallGame() {
  const { settings } = useSettings();
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

  // Camera position/fov and lighting rig — overridable from
  // Admin > Magic 8-Ball, falling back to the defaults above.
  const cameraView = useMemo(() => ({
    pos: [
      num(settings.magic8ball_camera_x, DEFAULT_CAMERA_VIEW.pos[0]),
      num(settings.magic8ball_camera_y, DEFAULT_CAMERA_VIEW.pos[1]),
      num(settings.magic8ball_camera_z, DEFAULT_CAMERA_VIEW.pos[2]),
    ],
    fov: num(settings.magic8ball_camera_fov, DEFAULT_CAMERA_VIEW.fov),
  }), [
    settings.magic8ball_camera_x,
    settings.magic8ball_camera_y,
    settings.magic8ball_camera_z,
    settings.magic8ball_camera_fov,
  ]);

  const lighting = useMemo(() => ({
    ambientIntensity: num(settings.magic8ball_light_ambient_intensity, DEFAULT_LIGHTING.ambientIntensity),
    ambientColor: settings.magic8ball_light_ambient_color || DEFAULT_LIGHTING.ambientColor,
    dir1Intensity: num(settings.magic8ball_light_dir1_intensity, DEFAULT_LIGHTING.dir1Intensity),
    dir2Intensity: num(settings.magic8ball_light_dir2_intensity, DEFAULT_LIGHTING.dir2Intensity),
    pointIntensity: num(settings.magic8ball_light_point_intensity, DEFAULT_LIGHTING.pointIntensity),
    pointColor: settings.magic8ball_light_point_color || DEFAULT_LIGHTING.pointColor,
  }), [
    settings.magic8ball_light_ambient_intensity,
    settings.magic8ball_light_ambient_color,
    settings.magic8ball_light_dir1_intensity,
    settings.magic8ball_light_dir2_intensity,
    settings.magic8ball_light_point_intensity,
    settings.magic8ball_light_point_color,
  ]);

  // Question title, murky-filter cover and die/result-face appearance —
  // overridable from Admin > Magic 8-Ball, falling back to the defaults
  // above. Colours/depths/opacity apply on page reload; the die geometry
  // (depth + result-face pop) is rebuilt via dieGeo's own memo.
  const appearance = useMemo(() => ({
    questionTitle: settings.magic8ball_question_title || DEFAULT_QUESTION_TITLE,
    questionColor: settings.magic8ball_question_color || DEFAULT_QUESTION_COLOR,
    questionOpacity: num(settings.magic8ball_question_opacity, DEFAULT_QUESTION_OPACITY),
    questionDepth: num(settings.magic8ball_question_depth, DEFAULT_QUESTION_DEPTH),
    filterColor: settings.magic8ball_filter_color || DEFAULT_FILTER_COLOR,
    filterOpacity: num(settings.magic8ball_filter_opacity, DEFAULT_FILTER_OPACITY),
    filterDepth: num(settings.magic8ball_filter_depth, DEFAULT_FILTER_DEPTH),
    dieDepth: num(settings.magic8ball_die_depth, DEFAULT_DIE_DEPTH),
    resultFacePop: num(settings.magic8ball_result_face_pop, DEFAULT_RESULT_FACE_POP),
    revealLeadMs: num(settings.magic8ball_reveal_lead_ms, DEFAULT_REVEAL_LEAD_MS),
  }), [
    settings.magic8ball_question_title,
    settings.magic8ball_question_color,
    settings.magic8ball_question_opacity,
    settings.magic8ball_question_depth,
    settings.magic8ball_filter_color,
    settings.magic8ball_filter_opacity,
    settings.magic8ball_filter_depth,
    settings.magic8ball_die_depth,
    settings.magic8ball_result_face_pop,
    settings.magic8ball_reveal_lead_ms,
  ]);

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
        cameraView={cameraView}
        lighting={lighting}
        appearance={appearance}
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
