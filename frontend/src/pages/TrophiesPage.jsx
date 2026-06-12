import { useEffect, useState, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, MeshTransmissionMaterial, useGLTF } from '@react-three/drei';
import { api } from '../lib/api.js';

function FrostedDice({ children }) {
  return (
    <group>
      <mesh castShadow>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.6}
          roughness={0.2}
          chromaticAberration={0.04}
          distortion={0.4}
          distortionScale={0.3}
          temporalDistortion={0.1}
          color="#ffffff"
        />
      </mesh>
      {/* Inner placeholder object (replace with GLB once provided) */}
      <group scale={0.6}>{children}</group>
    </group>
  );
}

function InnerModel() {
  // When /dice-objects/trophy.glb is added, swap this for: const { scene } = useGLTF('/dice-objects/trophy.glb'); return <primitive object={scene} />
  return (
    <mesh>
      <icosahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial color="#e94f9f" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}

function TrophyCanvas({ size = 220 }) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas shadows camera={{ position: [2.2, 1.4, 2.2], fov: 35 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 5, 3]} intensity={1.2} castShadow />
        <directionalLight position={[-4, 2, -3]} intensity={0.4} />
        <Suspense fallback={null}>
          <FrostedDice>
            <InnerModel />
          </FrostedDice>
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={true} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}

export default function TrophiesPage() {
  const [trophies, setTrophies] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listTrophies().then(setTrophies).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="space-y-4 py-6">
        <Link to="/account" className="text-sm text-neutral-500">Back</Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (trophies === null) return <div className="py-6 text-center text-sm text-neutral-500">Loading...</div>;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <Link to="/account" className="text-sm font-medium text-neutral-500">Back</Link>
        <h1 className="text-lg font-semibold tracking-tight">Dice trophies</h1>
        <span className="w-12" />
      </div>

      {trophies.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          <p className="text-sm text-neutral-500">No trophies yet.</p>
          <p className="mt-1 text-xs text-neutral-400">Shut the box to win one.</p>
          <Link to="/games/shut-the-box-15" className="mt-3 inline-block text-xs font-medium text-teal-700 underline">Go play</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {trophies.map((t) => (
            <div key={t.id} className="rounded-2xl border border-neutral-200 bg-white p-2">
              <TrophyCanvas size={150} />
              <p className="mt-1 text-center text-[11px] text-neutral-500">Won {new Date(t.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
