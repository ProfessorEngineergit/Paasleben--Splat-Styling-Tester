const THREE = require('three');
const flipZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-28));
const finalQ = flipZ.clone().premultiply(rotY);
console.log(finalQ.toArray());
