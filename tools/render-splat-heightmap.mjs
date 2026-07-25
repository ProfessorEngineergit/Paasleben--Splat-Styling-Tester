import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const [minimumX, maximumX, minimumZ, maximumZ] = (process.argv[2] ?? '-2.3,-0.8,-0.35,0.9')
  .split(',')
  .map(Number);
const outputPath = path.resolve(process.argv[3] ?? path.join(root, 'artifacts', 'splat-heightmap.ppm'));
const width = Number.parseInt(process.argv[4] ?? '1200', 10);
const height = Math.max(1, Math.round(width * (maximumZ - minimumZ) / (maximumX - minimumX)));

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

const peak = new Float32Array(width * height);
peak.fill(Number.NEGATIVE_INFINITY);
const point = new THREE.Vector3();
for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (point.x < minimumX || point.x > maximumX || point.z < minimumZ || point.z > maximumZ) continue;
  const pixelX = Math.min(width - 1, Math.max(0, Math.floor((point.x - minimumX) / (maximumX - minimumX) * width)));
  const pixelY = Math.min(height - 1, Math.max(0, Math.floor((point.z - minimumZ) / (maximumZ - minimumZ) * height)));
  const pixelIndex = pixelY * width + pixelX;
  peak[pixelIndex] = Math.max(peak[pixelIndex], point.y);
}

function colour(value) {
  if (!Number.isFinite(value)) return [8, 12, 14];
  if (value < 0.02) return [30, 52, 42];
  if (value < 0.08) return [53, 81, 54];
  if (value < 0.13) return [97, 104, 57];
  if (value < 0.18) return [42, 121, 142];
  if (value < 0.24) return [67, 170, 188];
  if (value < 0.31) return [224, 195, 78];
  if (value < 0.40) return [236, 112, 44];
  return [244, 235, 215];
}

const pixels = Buffer.alloc(width * height * 3);
for (let index = 0; index < peak.length; index += 1) {
  const [red, green, blue] = colour(peak[index]);
  pixels[index * 3] = red;
  pixels[index * 3 + 1] = green;
  pixels[index * 3 + 2] = blue;
}

fs.writeFileSync(outputPath, Buffer.concat([
  Buffer.from(`P6\n${width} ${height}\n255\n`),
  pixels,
]));
console.log(JSON.stringify({ outputPath, bounds: [minimumX, maximumX, minimumZ, maximumZ], width, height }));
