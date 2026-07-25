import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const input = path.join(root, 'public', 'scene.ksplat');
const output = path.join(root, 'artifacts', 'splat-reference-top.ppm');
const width = 1600;
const height = 1050;
const xMin = -5.2;
const xMax = 3.45;
const zMin = -2.55;
const zMax = 2.95;

const file = fs.readFileSync(input);
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const splats = new GaussianSplats3D.SplatBuffer(arrayBuffer);

// Same final transform as src/lib/splat-alignment.js + REFERENCE_SPLAT.
const fallbackYaw = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-28),
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

const pixels = Buffer.alloc(width * height * 3);
const depth = new Float32Array(width * height);
depth.fill(-Infinity);
for (let i = 0; i < width * height; i++) {
  const p = i * 3;
  pixels[p] = 239;
  pixels[p + 1] = 235;
  pixels[p + 2] = 218;
}

const center = new THREE.Vector3();
const color = new THREE.Vector4();
let drawn = 0;
for (let i = 0; i < splats.getSplatCount(); i++) {
  splats.getSplatCenter(i, center, transform);
  if (center.x < xMin || center.x > xMax || center.z < zMin || center.z > zMax) continue;
  if (center.y < -0.72 || center.y > 1.3) continue;
  splats.getSplatColor(i, color);
  if (color.w < 18) continue;
  const px = Math.round((center.x - xMin) / (xMax - xMin) * (width - 1));
  const py = Math.round((zMax - center.z) / (zMax - zMin) * (height - 1));
  const radius = center.y > 0.28 ? 2 : 1;
  for (let oy = -radius; oy <= radius; oy++) {
    const y = py + oy;
    if (y < 0 || y >= height) continue;
    for (let ox = -radius; ox <= radius; ox++) {
      const x = px + ox;
      if (x < 0 || x >= width) continue;
      const idx = y * width + x;
      const falloff = ox * ox + oy * oy;
      const effectiveHeight = center.y - falloff * 0.002;
      if (effectiveHeight < depth[idx]) continue;
      depth[idx] = effectiveHeight;
      const p = idx * 3;
      pixels[p] = color.x;
      pixels[p + 1] = color.y;
      pixels[p + 2] = color.z;
    }
  }
  drawn++;
}

fs.writeFileSync(output, Buffer.concat([
  Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'),
  pixels,
]));

console.log(JSON.stringify({ output, splatCount: splats.getSplatCount(), drawn, bounds: { xMin, xMax, zMin, zMax } }, null, 2));
