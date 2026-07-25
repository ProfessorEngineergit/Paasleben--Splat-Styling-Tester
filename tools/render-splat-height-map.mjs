import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'public', 'scene.ksplat');

function readNumber(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`Ungültiger Zahlenwert für ${flag}`);
  return value;
}

function readString(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

const width = Math.round(readNumber('--width', 1600));
const height = Math.round(readNumber('--height', 1000));
const xMin = readNumber('--x-min', -2.20);
const xMax = readNumber('--x-max', -0.20);
const zMin = readNumber('--z-min', -0.65);
const zMax = readNumber('--z-max', 0.80);
const output = path.resolve(root, readString('--output', 'artifacts/splat-height-map.ppm'));

if (xMax <= xMin || zMax <= zMin || width < 2 || height < 2) {
  throw new Error('Ungültige Kartenabmessungen');
}

const file = fs.readFileSync(input);
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const splats = new GaussianSplats3D.SplatBuffer(arrayBuffer);

// Keep this transform identical to splat-reference-viewer.js and
// render-splat-reference.mjs.  The resulting x/z values therefore map directly
// to the measured Blender coordinates used by the blockout generator.
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

const maxima = new Float32Array(width * height);
maxima.fill(-Infinity);
const density = new Uint16Array(width * height);
const center = new THREE.Vector3();
let accepted = 0;

for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, center, transform);
  if (center.x < xMin || center.x > xMax || center.z < zMin || center.z > zMax) continue;
  if (center.y < -0.45 || center.y > 0.90) continue;
  const px = Math.max(0, Math.min(width - 1, Math.round((center.x - xMin) / (xMax - xMin) * (width - 1))));
  const py = Math.max(0, Math.min(height - 1, Math.round((center.z - zMin) / (zMax - zMin) * (height - 1))));
  const pixelIndex = py * width + px;
  maxima[pixelIndex] = Math.max(maxima[pixelIndex], center.y);
  density[pixelIndex] = Math.min(65535, density[pixelIndex] + 1);
  accepted += 1;
}

function ramp(value, count) {
  if (!Number.isFinite(value)) return [15, 29, 26];
  // Ground remains dark. Persistent raised volumes move through green, gold,
  // orange and white. Density adds brightness without hiding peak height.
  const levels = [
    [-0.45, [31, 51, 42]],
    [0.10, [62, 86, 57]],
    [0.18, [104, 126, 66]],
    [0.23, [186, 148, 62]],
    [0.30, [221, 91, 39]],
    [0.38, [247, 193, 100]],
    [0.90, [255, 248, 222]],
  ];
  let color = levels[levels.length - 1][1];
  for (let index = 1; index < levels.length; index += 1) {
    const [lowValue, lowColor] = levels[index - 1];
    const [highValue, highColor] = levels[index];
    if (value <= highValue) {
      const t = Math.max(0, Math.min(1, (value - lowValue) / (highValue - lowValue)));
      color = lowColor.map((channel, channelIndex) => Math.round(channel + (highColor[channelIndex] - channel) * t));
      break;
    }
  }
  const densityBoost = Math.min(24, Math.log2(count + 1) * 5);
  return color.map((channel) => Math.min(255, Math.round(channel + densityBoost)));
}

const pixels = Buffer.alloc(width * height * 3);
for (let index = 0; index < maxima.length; index += 1) {
  const [red, green, blue] = ramp(maxima[index], density[index]);
  const offsetIndex = index * 3;
  pixels[offsetIndex] = red;
  pixels[offsetIndex + 1] = green;
  pixels[offsetIndex + 2] = blue;
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([
  Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'),
  pixels,
]));

console.log(JSON.stringify({
  output,
  accepted,
  bounds: { xMin, xMax, zMin, zMax },
  size: { width, height },
}, null, 2));
