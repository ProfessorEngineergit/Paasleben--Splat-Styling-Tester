const THREE = require('three');

function getQuat(rotDeg) {
  const flipZ = new THREE.Quaternion(0, 0, 1, 0);
  const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(rotDeg));
  return flipZ.premultiply(rotY);
}

console.log("Original 45 deg:", getQuat(45).toArray());
console.log("New -28 deg:", getQuat(-28).toArray());
