import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'artifacts', 'splat-reference-set');
const WIDTH = 1280;
const HEIGHT = 720;

const locations = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'locations-snapshot.json'), 'utf8'));

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function markerData() {
  return locations
    .filter((location) => location.visible !== false)
    .map((location, index) => ({
      number: location.displayNumber || String(index + 1).padStart(2, '0'),
      name: location.title,
      x: location.position.x,
      z: location.position.z,
    }));
}

function imageHref(filename) {
  const jpeg = fs.readFileSync(path.join(OUT, filename)).toString('base64');
  return `data:image/jpeg;base64,${jpeg}`;
}

function project(x, z, centerX, centerZ, spanX) {
  const spanZ = spanX / (WIDTH / HEIGHT);
  return {
    x: WIDTH / 2 + ((x - centerX) / spanX) * WIDTH,
    y: HEIGHT / 2 + ((z - centerZ) / spanZ) * HEIGHT,
  };
}

function buildAnnotatedSite() {
  const centerX = -0.45;
  const centerZ = -0.42;
  const spanX = 7.35;
  const markers = markerData();
  const dots = markers.map((marker) => {
    const p = project(marker.x, marker.z, centerX, centerZ, spanX);
    return `
      <g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})">
        <circle r="12" fill="#ffad32" stroke="#172a26" stroke-width="3"/>
        <text y="4" text-anchor="middle" class="number">${esc(marker.number)}</text>
      </g>`;
  }).join('');
  const columns = markers.map((marker, index) => {
    const col = Math.floor(index / 6);
    const row = index % 6;
    const x = 28 + col * 185;
    const y = 548 + row * 24;
    return `<text x="${x}" y="${y}" class="legend"><tspan class="legend-number">${esc(marker.number)}</tspan> ${esc(marker.name)}</text>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    .number { font: 700 10px Inter, Arial, sans-serif; fill: #172a26; }
    .legend { font: 600 13px Inter, Arial, sans-serif; fill: #fff7e3; paint-order: stroke; stroke: #172a26; stroke-width: 3px; }
    .legend-number { fill: #ffbd57; }
    .title { font: 800 18px Inter, Arial, sans-serif; letter-spacing: .08em; fill: #fff7e3; }
    .sub { font: 500 12px Inter, Arial, sans-serif; fill: #d8e5dc; }
  </style>
  <image href="${imageHref('01-top-site.jpg')}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="none" stroke="#ffbd57" stroke-width="2"/>
  <rect x="14" y="14" width="470" height="70" rx="10" fill="#172a26" fill-opacity=".86"/>
  <text x="32" y="42" class="title">KSPLAT · VERMESSENER AREAL-AUSSCHNITT</text>
  <text x="32" y="64" class="sub">Punkte stammen direkt aus locations-snapshot.json · keine geschätzten Blender-Positionen</text>
  ${dots}
  <rect x="12" y="520" width="570" height="188" rx="12" fill="#172a26" fill-opacity=".82"/>
  ${columns}
</svg>`;
}

function buildFullGrid() {
  const centerX = -2.474;
  const centerZ = 0.575;
  const spanX = 13.45;
  const spanZ = spanX / (WIDTH / HEIGHT);
  const xMin = centerX - spanX / 2;
  const xMax = centerX + spanX / 2;
  const zMin = centerZ - spanZ / 2;
  const zMax = centerZ + spanZ / 2;
  const lines = [];
  for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x += 1) {
    const p = project(x, centerZ, centerX, centerZ, spanX);
    lines.push(`<line x1="${p.x.toFixed(2)}" y1="0" x2="${p.x.toFixed(2)}" y2="${HEIGHT}"/><text x="${(p.x + 5).toFixed(2)}" y="20">x ${x}</text>`);
  }
  for (let z = Math.ceil(zMin); z <= Math.floor(zMax); z += 1) {
    const p = project(centerX, z, centerX, centerZ, spanX);
    lines.push(`<line x1="0" y1="${p.y.toFixed(2)}" x2="${WIDTH}" y2="${p.y.toFixed(2)}"/><text x="5" y="${(p.y - 5).toFixed(2)}">z ${z}</text>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    line { stroke: #ffd26f; stroke-width: 1; stroke-opacity: .48; }
    text { font: 700 11px ui-monospace, SFMono-Regular, monospace; fill: #fff4ce; paint-order: stroke; stroke: #172a26; stroke-width: 3px; }
  </style>
  <image href="${imageHref('00-top-full.jpg')}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>
  <g>${lines.join('\n')}</g>
  <rect x="16" y="${HEIGHT - 58}" width="470" height="42" rx="8" fill="#172a26" fill-opacity=".86"/>
  <text x="30" y="${HEIGHT - 32}">1 Rasterfeld = 1 transformierte KSplat-Einheit · Gesamtspanne ${spanX.toFixed(2)} × ${spanZ.toFixed(2)}</text>
</svg>`;
}

fs.writeFileSync(path.join(OUT, '12-top-site-markers.svg'), buildAnnotatedSite());
fs.writeFileSync(path.join(OUT, '13-top-full-grid.svg'), buildFullGrid());

console.log('SPLAT_REFERENCE_MAPS_DONE');
