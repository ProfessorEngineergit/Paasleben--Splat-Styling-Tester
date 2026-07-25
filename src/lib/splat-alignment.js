// Gemeinsame Splat-Ausrichtung für Viewer (src/main.js) und Editor
// (src/admin/*): Konstanten und pure Helfer, die den Splat am GLB-Anker
// ausrichten. Verhalten identisch zur früheren Inline-Version im Viewer.
import * as THREE from 'three';

export const SPLAT_ROTATION_FALLBACK_DEG = -28;
export const SPLAT_SCALE = 1;

export const REFERENCE_SPLAT = {
  positionOffset: { x: -0.04, y: -0.16, z: -0.03 },
  rotationOffset: { x: 6, y: -118, z: 12 },
  scale: 1,
};

export const REFERENCE_CAMERA = {
  position: { x: 3.434, y: 1.703, z: 3.007 },
  target: { x: 1.288, y: 0.306, z: 1.874 },
};

const ALIGNMENT_EPSILON = 1e-6;
const SPLAT_FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);

const nearlyZero = (v) => Math.abs(v) <= ALIGNMENT_EPSILON;
const nearlyOne = (v) => Math.abs(v - 1) <= ALIGNMENT_EPSILON;

const isIdentityPosition = (position) => (
  nearlyZero(position.x) && nearlyZero(position.y) && nearlyZero(position.z)
);

const isIdentityScale = (scale) => (
  nearlyOne(scale.x) && nearlyOne(scale.y) && nearlyOne(scale.z)
);

const isIdentityQuaternion = (quaternion) => (
  Math.abs(1 - Math.abs(quaternion.w)) <= ALIGNMENT_EPSILON &&
  nearlyZero(quaternion.x) &&
  nearlyZero(quaternion.y) &&
  nearlyZero(quaternion.z)
);

const findSplatAnchor = (scene) => {
  let exact = null;
  let loose = null;
  scene.traverse((node) => {
    const name = node.name || '';
    if (!exact && /^splat(_anchor)?$/i.test(name)) exact = node;
    if (!loose && /splat/i.test(name)) loose = node;
  });
  return exact || loose || scene;
};

export const buildSplatAlignment = (gltfScene, fallbackRotationDeg = SPLAT_ROTATION_FALLBACK_DEG) => {
  const fallbackYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(fallbackRotationDeg),
  );

  if (!gltfScene) {
    return {
      source: 'fallback',
      position: new THREE.Vector3(),
      quaternion: fallbackYaw,
      scale: new THREE.Vector3(1, 1, 1),
      matrix: new THREE.Matrix4(),
      hasAuthoredTransform: false,
    };
  }

  gltfScene.updateMatrixWorld(true);
  const sourceNode = findSplatAnchor(gltfScene);
  sourceNode.updateMatrixWorld(true);

  const position = new THREE.Vector3();
  const authoredQuaternion = new THREE.Quaternion();
  const authoredScale = new THREE.Vector3();
  sourceNode.matrixWorld.decompose(position, authoredQuaternion, authoredScale);

  const hasAuthoredPosition = !isIdentityPosition(position);
  const hasAuthoredRotation = !isIdentityQuaternion(authoredQuaternion);
  const hasAuthoredScale = !isIdentityScale(authoredScale);
  const quaternion = hasAuthoredRotation ? authoredQuaternion : fallbackYaw;
  const scale = hasAuthoredScale ? authoredScale : new THREE.Vector3(1, 1, 1);

  return {
    source: sourceNode.name || 'GLB scene',
    position,
    quaternion,
    scale,
    matrix: sourceNode.matrixWorld.clone(),
    hasAuthoredTransform: hasAuthoredPosition || hasAuthoredRotation || hasAuthoredScale,
  };
};

export const applyAlignmentToSplat = (splatMesh, alignment) => {
  if (!splatMesh || !alignment) return;
  splatMesh.position.copy(alignment.position);
  splatMesh.quaternion.copy(alignment.quaternion).multiply(SPLAT_FLIP);
  splatMesh.scale.copy(alignment.scale);
  splatMesh.updateMatrix();
  splatMesh.updateMatrixWorld(true);
  splatMesh.matrixWorldNeedsUpdate = true;
};

export const applySplatOffset = (splatMesh, base, offset = REFERENCE_SPLAT) => {
  if (!splatMesh || !base) return;
  const offsetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(offset.rotationOffset.x),
    THREE.MathUtils.degToRad(offset.rotationOffset.y),
    THREE.MathUtils.degToRad(offset.rotationOffset.z),
    'XYZ',
  ));
  splatMesh.position.copy(base.position).add(new THREE.Vector3(
    offset.positionOffset.x,
    offset.positionOffset.y,
    offset.positionOffset.z,
  ));
  splatMesh.quaternion.copy(base.quaternion).multiply(offsetQuat);
  splatMesh.scale.copy(base.scale).multiplyScalar(offset.scale);
  splatMesh.updateMatrix();
  splatMesh.updateMatrixWorld(true);
  splatMesh.matrixWorldNeedsUpdate = true;
};
