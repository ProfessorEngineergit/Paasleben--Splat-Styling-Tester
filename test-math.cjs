const THREE = require('three');
const flipZ = new THREE.Quaternion(0, 0, 1, 0); // Z=1, W=0 (180 deg around Z)
const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(45));

const res1 = flipZ.clone().premultiply(rotY);
const res2 = rotY.clone().premultiply(flipZ);

const flipX = new THREE.Quaternion(1, 0, 0, 0); // 180 around X
const res3 = flipX.clone().premultiply(rotY);

console.log("Original we wanted:", [0.38268, 0, 0.92388, 0]);
console.log("Z flip then rotY:  ", res1.toArray());
console.log("rotY then Z flip:  ", res2.toArray());
console.log("X flip then rotY:  ", res3.toArray());

