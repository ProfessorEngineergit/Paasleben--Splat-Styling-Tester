import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const minimumHeight = Number.parseFloat(process.argv[2] ?? '0.18');
const sampleCentreX = Number.parseFloat(process.argv[3] ?? '-3.40');
const sampleCentreZ = Number.parseFloat(process.argv[4] ?? '-1.34');
const sampleRadius = Number.parseFloat(process.argv[5] ?? '0.46');
const cellSize = 0.009;
const neighbourRadius = 2;

const file = fs.readFileSync(path.join(root, 'public', 'scene.ksplat'));
const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const splats = new GaussianSplats3D.SplatBuffer(buffer);
const fallbackYaw = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-28),
);
const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(-118), THREE.MathUtils.degToRad(12), 'XYZ',
));
const transform = new THREE.Matrix4().compose(
  new THREE.Vector3(-0.04, -0.16, -0.03),
  fallbackYaw.multiply(flip).multiply(offset),
  new THREE.Vector3(1, 1, 1),
);

const point = new THREE.Vector3();
const cells = new Map();
const cellKey = (ix, iz) => `${ix},${iz}`;
for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (
    (point.x - sampleCentreX) ** 2 + (point.z - sampleCentreZ) ** 2 > sampleRadius ** 2
    || point.y < minimumHeight
  ) continue;
  const ix = Math.round(point.x / cellSize);
  const iz = Math.round(point.z / cellSize);
  const key = cellKey(ix, iz);
  if (!cells.has(key)) cells.set(key, { ix, iz, points: [] });
  cells.get(key).points.push([point.x, point.y, point.z]);
}

const unseen = new Set(cells.keys());
const components = [];
while (unseen.size) {
  const first = unseen.values().next().value;
  unseen.delete(first);
  const queue = [cells.get(first)];
  const points = [];
  while (queue.length) {
    const current = queue.pop();
    points.push(...current.points);
    for (let dx = -neighbourRadius; dx <= neighbourRadius; dx += 1) {
      for (let dz = -neighbourRadius; dz <= neighbourRadius; dz += 1) {
        if (dx === 0 && dz === 0) continue;
        const neighbour = cellKey(current.ix + dx, current.iz + dz);
        if (!unseen.has(neighbour)) continue;
        unseen.delete(neighbour);
        queue.push(cells.get(neighbour));
      }
    }
  }
  if (points.length >= 12) components.push(points);
}

function quantile(values, fraction) {
  values.sort((a, b) => a - b);
  return values[Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * fraction)))];
}

function describe(points) {
  const meanX = points.reduce((sum, sample) => sum + sample[0], 0) / points.length;
  const meanZ = points.reduce((sum, sample) => sum + sample[2], 0) / points.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, , z] of points) {
    const dx = x - meanX;
    const dz = z - meanZ;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  let angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  let axisX = Math.cos(angle);
  let axisZ = Math.sin(angle);
  let crossX = -axisZ;
  let crossZ = axisX;
  let along = points.map(([x, , z]) => (x - meanX) * axisX + (z - meanZ) * axisZ);
  let across = points.map(([x, , z]) => (x - meanX) * crossX + (z - meanZ) * crossZ);
  let alongLow = quantile(along, 0.02);
  let alongHigh = quantile(along, 0.98);
  let acrossLow = quantile(across, 0.02);
  let acrossHigh = quantile(across, 0.98);
  if (acrossHigh - acrossLow > alongHigh - alongLow) {
    angle += Math.PI / 2;
    axisX = Math.cos(angle);
    axisZ = Math.sin(angle);
    crossX = -axisZ;
    crossZ = axisX;
    along = points.map(([x, , z]) => (x - meanX) * axisX + (z - meanZ) * axisZ);
    across = points.map(([x, , z]) => (x - meanX) * crossX + (z - meanZ) * crossZ);
    alongLow = quantile(along, 0.02);
    alongHigh = quantile(along, 0.98);
    acrossLow = quantile(across, 0.02);
    acrossHigh = quantile(across, 0.98);
  }
  while (angle < 0) angle += Math.PI;
  while (angle >= Math.PI) angle -= Math.PI;
  const alongCentre = (alongLow + alongHigh) / 2;
  const acrossCentre = (acrossLow + acrossHigh) / 2;
  return {
    count: points.length,
    centre: [
      meanX + alongCentre * axisX + acrossCentre * crossX,
      meanZ + alongCentre * axisZ + acrossCentre * crossZ,
    ],
    length: alongHigh - alongLow,
    width: acrossHigh - acrossLow,
    angleDeg: THREE.MathUtils.radToDeg(angle),
    heightRange: [
      quantile(points.map((sample) => sample[1]), 0.02),
      quantile(points.map((sample) => sample[1]), 0.98),
    ],
  };
}

console.log(JSON.stringify({
  minimumHeight,
  sampleCentre: [sampleCentreX, sampleCentreZ],
  sampleRadius,
  components: components.map(describe).sort((a, b) => b.count - a.count),
}, null, 2));
