import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const minimumHeight = Number.parseFloat(process.argv[2] ?? '0.13');
const sites = [
  { title: 'Pferde-Stall', x: -1.789057970046997, z: 0.5469812750816345 },
  { title: 'Werkstatt', x: -1.7498, z: 0.2397 },
  { title: 'Atelier', x: -1.524, z: 0.567 },
];

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

const point = new THREE.Vector3();
const assignments = new Map(sites.map((site) => [site.title, []]));
for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (point.x < -2.15 || point.x > -1.25 || point.z < 0.05 || point.z > 0.85 || point.y < minimumHeight) continue;
  const nearest = sites.reduce((best, site) => {
    const distance = (point.x - site.x) ** 2 + (point.z - site.z) ** 2;
    return !best || distance < best.distance ? { site, distance } : best;
  }, null);
  assignments.get(nearest.site.title).push([point.x, point.z]);
}

function quantile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1))))];
}

function measure(site) {
  const points = assignments.get(site.title);
  const meanX = points.reduce((sum, sample) => sum + sample[0], 0) / points.length;
  const meanZ = points.reduce((sum, sample) => sum + sample[1], 0) / points.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, z] of points) {
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
  let along = points.map(([x, z]) => (x - meanX) * axisX + (z - meanZ) * axisZ);
  let across = points.map(([x, z]) => (x - meanX) * crossX + (z - meanZ) * crossZ);
  let alongLow = quantile(along, 0.025);
  let alongHigh = quantile(along, 0.975);
  let acrossLow = quantile(across, 0.025);
  let acrossHigh = quantile(across, 0.975);
  if (acrossHigh - acrossLow > alongHigh - alongLow) {
    angle += Math.PI / 2;
    axisX = Math.cos(angle);
    axisZ = Math.sin(angle);
    crossX = -axisZ;
    crossZ = axisX;
    along = points.map(([x, z]) => (x - meanX) * axisX + (z - meanZ) * axisZ);
    across = points.map(([x, z]) => (x - meanX) * crossX + (z - meanZ) * crossZ);
    alongLow = quantile(along, 0.025);
    alongHigh = quantile(along, 0.975);
    acrossLow = quantile(across, 0.025);
    acrossHigh = quantile(across, 0.975);
  }
  while (angle < 0) angle += Math.PI;
  while (angle >= Math.PI) angle -= Math.PI;
  const alongCenter = (alongLow + alongHigh) / 2;
  const acrossCenter = (acrossLow + acrossHigh) / 2;
  return {
    title: site.title,
    count: points.length,
    centerX: meanX + alongCenter * axisX + acrossCenter * crossX,
    centerZ: meanZ + alongCenter * axisZ + acrossCenter * crossZ,
    length: alongHigh - alongLow,
    width: acrossHigh - acrossLow,
    angleDeg: THREE.MathUtils.radToDeg(angle),
  };
}

console.log(JSON.stringify({ minimumHeight, roofs: sites.map(measure) }, null, 2));
