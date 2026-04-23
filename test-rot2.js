const THREE = require('three');
const flipX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const flipZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-28));

console.log("X + Y:", flipX.clone().premultiply(rotY).toArray());
console.log("Z + Y:", flipZ.clone().premultiply(rotY).toArray());

