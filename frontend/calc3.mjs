import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(0.62, 0);
const pos = geo.attributes.position;
const f = 6;
const a = new THREE.Vector3().fromBufferAttribute(pos, f*3+0);
const b = new THREE.Vector3().fromBufferAttribute(pos, f*3+1);
const c = new THREE.Vector3().fromBufferAttribute(pos, f*3+2);
const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);

const theta = 0.36486382754888896;
const rotY = new THREE.Matrix4().makeRotationY(theta);

function toLocal(v) {
  return v.clone().sub(centroid).applyMatrix4(rotY);
}

console.log('a local', toLocal(a));
console.log('b local', toLocal(b));
console.log('c local', toLocal(c));
