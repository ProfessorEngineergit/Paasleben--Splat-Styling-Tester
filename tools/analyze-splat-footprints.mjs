import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const root = path.resolve(import.meta.dirname, '..');
const heightOffset = Number.parseFloat(process.argv[2] ?? '0.055');
const neighbourRadius = Number.parseInt(process.argv[3] ?? '2', 10);
const minimumComponentPoints = Number.parseInt(process.argv[4] ?? '45', 10);
const locations = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'locations-snapshot.json'), 'utf8'));
const wanted = new Set([
  'Trafo-Haus', 'Frauen-Haus', 'Hallen', 'Pumpenhaus', 'Turm',
  'Pferde-Stall', 'Werkstatt', 'Hühner-Stall', 'Pfauen-Stall',
  'Unterkunft', 'Atelier',
]);
const syntheticLocations = [
  { title: 'North guest house', position: { x: -0.54, z: -1.54 } },
  { title: 'North utility shed', position: { x: -1.32, z: -2.07 } },
  { title: 'South core house', position: { x: -1.94, z: -0.08 } },
  { title: 'Blue shelter A', position: { x: -0.54, z: -0.24 } },
  { title: 'Blue shelter B', position: { x: -0.40, z: -0.10 } },
  { title: 'Pond shed', position: { x: -3.10, z: -1.08 } },
];

const radii = new Map([
  ['Hallen', 0.92],
  ['Pumpenhaus', 0.48],
  ['Frauen-Haus', 0.46],
  ['Unterkunft', 0.46],
  ['Pferde-Stall', 0.50],
  ['Atelier', 0.42],
  ['North guest house', 0.32],
  ['North utility shed', 0.30],
  ['South core house', 0.30],
  ['Blue shelter A', 0.24],
  ['Blue shelter B', 0.24],
  ['Pond shed', 0.24],
]);

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
const points = [];
for (let index = 0; index < splats.getSplatCount(); index += 1) {
  splats.getSplatCenter(index, point, transform);
  if (point.x < -5.4 || point.x > 3.9 || point.z < -3.2 || point.z > 4.0) continue;
  points.push([point.x, point.y, point.z]);
}

function quantile(sorted, fraction) {
  if (!sorted.length) return Number.NaN;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1))))];
}

function key(ix, iz) {
  return `${ix},${iz}`;
}

function percentileBounds(values, lower = 0.02, upper = 0.98) {
  values.sort((a, b) => a - b);
  return [quantile(values, lower), quantile(values, upper)];
}

function analyse(location) {
  const markerX = location.position.x;
  const markerZ = location.position.z;
  const radius = radii.get(location.title) ?? 0.38;
  const local = points.filter(([x, , z]) => (x - markerX) ** 2 + (z - markerZ) ** 2 <= radius ** 2);
  const heights = local.map(([, y]) => y).sort((a, b) => a - b);
  const ground = quantile(heights, 0.05);
  const peak = quantile(heights, 0.997);
  const threshold = ground + heightOffset;
  const cellSize = 0.0125;
  const cellPoints = new Map();

  for (const sample of local) {
    const [x, y, z] = sample;
    if (y < threshold) continue;
    const ix = Math.round(x / cellSize);
    const iz = Math.round(z / cellSize);
    const cellKey = key(ix, iz);
    if (!cellPoints.has(cellKey)) cellPoints.set(cellKey, { ix, iz, points: [] });
    cellPoints.get(cellKey).points.push(sample);
  }

  const unseen = new Set(cellPoints.keys());
  const components = [];
  while (unseen.size) {
    const first = unseen.values().next().value;
    unseen.delete(first);
    const queue = [cellPoints.get(first)];
    const cells = [];
    const componentPoints = [];
    while (queue.length) {
      const current = queue.pop();
      cells.push(current);
      componentPoints.push(...current.points);
      for (let dx = -neighbourRadius; dx <= neighbourRadius; dx += 1) {
        for (let dz = -neighbourRadius; dz <= neighbourRadius; dz += 1) {
          if (dx === 0 && dz === 0) continue;
          const neighbour = key(current.ix + dx, current.iz + dz);
          if (!unseen.has(neighbour)) continue;
          unseen.delete(neighbour);
          queue.push(cellPoints.get(neighbour));
        }
      }
    }
    if (componentPoints.length < minimumComponentPoints) continue;
    let markerDistance = Infinity;
    for (const [x, , z] of componentPoints) {
      markerDistance = Math.min(markerDistance, Math.hypot(x - markerX, z - markerZ));
    }
    components.push({ cells, points: componentPoints, markerDistance });
  }

  components.sort((a, b) => {
    const aScore = a.markerDistance + 0.012 / Math.sqrt(a.points.length);
    const bScore = b.markerDistance + 0.012 / Math.sqrt(b.points.length);
    return aScore - bScore;
  });
  const chosen = components[0];
  if (!chosen) return { title: location.title, error: 'no elevated component', ground, peak, threshold };

  const meanX = chosen.points.reduce((sum, [x]) => sum + x, 0) / chosen.points.length;
  const meanZ = chosen.points.reduce((sum, [, , z]) => sum + z, 0) / chosen.points.length;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, , z] of chosen.points) {
    const dx = x - meanX;
    const dz = z - meanZ;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const axisX = Math.cos(angle);
  const axisZ = Math.sin(angle);
  const crossX = -axisZ;
  const crossZ = axisX;
  const along = [];
  const across = [];
  for (const [x, , z] of chosen.points) {
    const dx = x - meanX;
    const dz = z - meanZ;
    along.push(dx * axisX + dz * axisZ);
    across.push(dx * crossX + dz * crossZ);
  }
  const [alongMin, alongMax] = percentileBounds(along);
  const [acrossMin, acrossMax] = percentileBounds(across);
  const alongCenter = (alongMin + alongMax) / 2;
  const acrossCenter = (acrossMin + acrossMax) / 2;
  let length = alongMax - alongMin;
  let width = acrossMax - acrossMin;
  let finalAngle = angle;
  if (width > length) {
    [length, width] = [width, length];
    finalAngle += Math.PI / 2;
  }
  while (finalAngle < 0) finalAngle += Math.PI;
  while (finalAngle >= Math.PI) finalAngle -= Math.PI;
  const centerX = meanX + alongCenter * axisX + acrossCenter * crossX;
  const centerZ = meanZ + alongCenter * axisZ + acrossCenter * crossZ;

  return {
    title: location.title,
    marker: { x: markerX, z: markerZ },
    ground,
    peak,
    heightMetres: (peak - ground) * 30,
    threshold,
    componentPoints: chosen.points.length,
    markerDistance: chosen.markerDistance,
    footprint: {
      centerX,
      centerZ,
      length,
      width,
      angleDeg: THREE.MathUtils.radToDeg(finalAngle),
      lengthMetres: length * 30,
      widthMetres: width * 30,
    },
  };
}

const results = [
  ...locations.filter((location) => wanted.has(location.title)),
  ...syntheticLocations,
].map(analyse);
console.log(JSON.stringify({ heightOffset, neighbourRadius, minimumComponentPoints, results }, null, 2));
