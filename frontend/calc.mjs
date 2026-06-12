import * as THREE from 'three';

const geo = new THREE.IcosahedronGeometry(0.62, 0);
const pos = geo.attributes.position;
console.log('vertex count', pos.count);

// Each face is 3 consecutive vertices (non-indexed for detail=0)
const faceIdx = 0; // first face
const a = new THREE.Vector3().fromBufferAttribute(pos, faceIdx*3+0);
const b = new THREE.Vector3().fromBufferAttribute(pos, faceIdx*3+1);
const c = new THREE.Vector3().fromBufferAttribute(pos, faceIdx*3+2);
console.log('a', a);
console.log('b', b);
console.log('c', c);

const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
console.log('centroid', centroid, 'len', centroid.length());

const normal = new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
console.log('normal', normal);

// inradius = centroid length
console.log('inradius', centroid.length());

// Now compute quaternion that rotates `normal` to (0,0,1)
const target = new THREE.Vector3(0,0,1);
const q = new THREE.Quaternion().setFromUnitVectors(normal.clone().normalize(), target);
const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
console.log('euler XYZ', euler);

// Also compute rotation for text: align text plane normal (+Z in local) to face normal, with some up vector
// up reference: project world Y onto plane perpendicular to normal
const up = new THREE.Vector3(0,1,0);
const textNormal = normal.clone();
// build basis: textZ = normal, textY = up projected, textX = textY cross textZ
let textY = up.clone().sub(textNormal.clone().multiplyScalar(up.dot(textNormal))).normalize();
let textX = new THREE.Vector3().crossVectors(textY, textNormal).normalize();
const m = new THREE.Matrix4().makeBasis(textX, textY, textNormal);
const textEuler = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');
console.log('text euler', textEuler);
console.log('text position (centroid * 1.0)', centroid);
