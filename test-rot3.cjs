const THREE = require('three');
const flipX = new THREE.Quaternion(1, 0, 0, 0); // 180 around X
const flipZ = new THREE.Quaternion(0, 0, 1, 0); // 180 around Z

const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-28));

console.log("X-flip then Y-rot:", flipX.clone().premultiply(rotY).toArray());
console.log("Z-flip then Y-rot:", flipZ.clone().premultiply(rotY).toArray());
