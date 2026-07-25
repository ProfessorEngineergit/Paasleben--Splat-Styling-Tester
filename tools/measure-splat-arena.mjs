import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
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
  new THREE.Vector3(-0.04, -0.16, -0.03), fallbackYaw.multiply(flip).multiply(offset), new THREE.Vector3(1, 1, 1),
);

const point = new THREE.Vector3();
const color = new THREE.Vector4();
const samples = [];
for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (point.x < -2.30 || point.x > -0.70 || point.z < -1.65 || point.z > -0.15) continue;
  if (point.y < -0.18 || point.y > 0.17) continue;
  splats.getSplatColor(index, color);
  if (color.w < 18) continue;
  samples.push([point.x, point.z, point.y, color.x, color.y, color.z]);
}

const clusterCount = 9;
let centres = Array.from({ length: clusterCount }, (_, index) => {
  const sample = samples[Math.floor((index + 0.5) * samples.length / clusterCount)];
  return sample.slice(3, 6);
});
let labels = new Uint8Array(samples.length);
for (let iteration = 0; iteration < 24; iteration += 1) {
  const sums = Array.from({ length: clusterCount }, () => [0, 0, 0, 0]);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const sample = samples[sampleIndex];
    let best = 0;
    let bestDistance = Infinity;
    for (let cluster = 0; cluster < clusterCount; cluster += 1) {
      const centre = centres[cluster];
      const distance = (sample[3] - centre[0]) ** 2 + (sample[4] - centre[1]) ** 2 + (sample[5] - centre[2]) ** 2;
      if (distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    labels[sampleIndex] = best;
    const sum = sums[best];
    sum[0] += sample[3];
    sum[1] += sample[4];
    sum[2] += sample[5];
    sum[3] += 1;
  }
  centres = sums.map((sum, index) => sum[3] ? sum.slice(0, 3).map(value => value / sum[3]) : centres[index]);
}

function quantile(values, fraction) {
  values.sort((a, b) => a - b);
  return values[Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * fraction)))];
}

function describe(cluster) {
  const points = samples.filter((_, index) => labels[index] === cluster);
  const meanX = points.reduce((sum, sample) => sum + sample[0], 0) / points.length;
  const meanZ = points.reduce((sum, sample) => sum + sample[1], 0) / points.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const sample of points) {
    const dx = sample[0] - meanX;
    const dz = sample[1] - meanZ;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  let angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  let axisX = Math.cos(angle);
  let axisZ = Math.sin(angle);
  let crossX = -axisZ;
  let crossZ = axisX;
  let along = points.map(sample => (sample[0] - meanX) * axisX + (sample[1] - meanZ) * axisZ);
  let across = points.map(sample => (sample[0] - meanX) * crossX + (sample[1] - meanZ) * crossZ);
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
    along = points.map(sample => (sample[0] - meanX) * axisX + (sample[1] - meanZ) * axisZ);
    across = points.map(sample => (sample[0] - meanX) * crossX + (sample[1] - meanZ) * crossZ);
    alongLow = quantile(along, 0.025);
    alongHigh = quantile(along, 0.975);
    acrossLow = quantile(across, 0.025);
    acrossHigh = quantile(across, 0.975);
  }
  const alongCentre = (alongLow + alongHigh) / 2;
  const acrossCentre = (acrossLow + acrossHigh) / 2;
  return {
    cluster,
    count: points.length,
    rgb: centres[cluster].map(value => Math.round(value)),
    centre: [meanX + alongCentre * axisX + acrossCentre * crossX, meanZ + alongCentre * axisZ + acrossCentre * crossZ],
    length: alongHigh - alongLow,
    width: acrossHigh - acrossLow,
    angleDeg: THREE.MathUtils.radToDeg(angle),
    meanHeight: points.reduce((sum, sample) => sum + sample[2], 0) / points.length,
  };
}

console.log(JSON.stringify({ sampleCount: samples.length, clusters: centres.map((_, index) => describe(index)).sort((a, b) => b.count - a.count) }, null, 2));
