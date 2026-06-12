import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(0.62, 0);
const pos = geo.attributes.position;
const faceCount = pos.count / 3;

let best = null;
for (let f = 0; f < faceCount; f++) {
  const a = new THREE.Vector3().fromBufferAttribute(pos, f*3+0);
  const b = new THREE.Vector3().fromBufferAttribute(pos, f*3+1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, f*3+2);
  const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
  const normal = centroid.clone().normalize();
  const z = normal.z;
  if (!best || z > best.z) best = { f, centroid, normal, z, a, b, c };
}
console.log('best face', best.f, 'z', best.z);
console.log('centroid', best.centroid, 'len', best.centroid.length());
console.log('normal', best.normal);

const target = new THREE.Vector3(0,0,1);
const q = new THREE.Quaternion().setFromUnitVectors(best.normal.clone(), target);
const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
console.log('euler XYZ to align face to +Z:', euler.x, euler.y, euler.z);

// after rotating die by this euler, where does centroid land + what's its local position pre-rotation (used for text position, unrotated/local)
console.log('text local position (pre-rotation, = centroid):', best.centroid);
