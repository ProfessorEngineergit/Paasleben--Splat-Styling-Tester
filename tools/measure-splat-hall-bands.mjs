import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const file = fs.readFileSync(path.join(root, 'public', 'scene.ksplat'));
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const splats = new GaussianSplats3D.SplatBuffer(arrayBuffer);

const fallbackYaw = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  THREE.MathUtils.degToRad(-28),
);
const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(6),
  THREE.MathUtils.degToRad(-118),
  THREE.MathUtils.degToRad(12),
  'XYZ',
));
const transform = new THREE.Matrix4().compose(
  new THREE.Vector3(-0.04, -0.16, -0.03),
  fallbackYaw.multiply(flip).multiply(offset),
  new THREE.Vector3(1, 1, 1),
);

const centre = new THREE.Vector2(-2.68, -1.22);
const angle = THREE.MathUtils.degToRad(-58.5);
const alongAxis = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
const acrossAxis = new THREE.Vector2(-alongAxis.y, alongAxis.x);
const point = new THREE.Vector3();
const candidates = [];

for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (point.y < 0.17 || point.y > 0.38) continue;
  const relative = new THREE.Vector2(point.x - centre.x, point.z - centre.y);
  const along = relative.dot(alongAxis);
  const across = relative.dot(acrossAxis);
  if (Math.abs(along) > 0.82 || Math.abs(across) > 0.52) continue;
  candidates.push({ x: point.x, z: point.z, y: point.y, along, across });
}

const binSize = 0.0125;
const bins = new Map();
for (const sample of candidates) {
  const bin = Math.round(sample.across / binSize);
  bins.set(bin, (bins.get(bin) ?? 0) + 1);
}
const histogram = [...bins.entries()]
  .map(([bin, count]) => ({ across: bin * binSize, count }))
  .sort((a, b) => a.across - b.across);

function quantile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1))))];
}

// Three broad cross-axis bands cover the two large roofs and the west annex.
const bandRanges = [
  [-0.50, -0.16],
  [-0.16, 0.13],
  [0.13, 0.49],
];

const bands = bandRanges.map(([minimum, maximum]) => {
  const band = candidates.filter((sample) => sample.across >= minimum && sample.across < maximum);
  if (!band.length) return { range: [minimum, maximum], count: 0 };
  const along = band.map((sample) => sample.along);
  const across = band.map((sample) => sample.across);
  const alongLow = quantile(along, 0.02);
  const alongHigh = quantile(along, 0.98);
  const acrossLow = quantile(across, 0.02);
  const acrossHigh = quantile(across, 0.98);
  const localCenter = alongAxis.clone().multiplyScalar((alongLow + alongHigh) / 2)
    .add(acrossAxis.clone().multiplyScalar((acrossLow + acrossHigh) / 2));
  return {
    range: [minimum, maximum],
    count: band.length,
    center: [centre.x + localCenter.x, centre.y + localCenter.y],
    length: alongHigh - alongLow,
    width: acrossHigh - acrossLow,
    lengthMetres: (alongHigh - alongLow) * 30,
    widthMetres: (acrossHigh - acrossLow) * 30,
  };
});

console.log(JSON.stringify({
  orientationDeg: THREE.MathUtils.radToDeg(angle),
  candidateCount: candidates.length,
  histogram,
  bands,
}, null, 2));
