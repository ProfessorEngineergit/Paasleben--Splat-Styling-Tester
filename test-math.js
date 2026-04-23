const THREE = require('three');
const q = new THREE.Quaternion(0, 0, 1, 0);
const y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(16));
q.premultiply(y);
console.log(q.toArray());
