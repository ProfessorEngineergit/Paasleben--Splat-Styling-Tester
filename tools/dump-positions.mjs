// Einmaliges Werkzeug: extrahiert die Weltpositionen der Standpunkt-Meshes
// aus public/Paasleben.glb in derselben Traversierungs-Reihenfolge wie der
// Viewer (three.js GLTFLoader + scene.traverse) und schreibt tools/positions.json.
//
//   node tools/dump-positions.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const glb = readFileSync(join(root, 'public/Paasleben.glb'));

const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
    '',
    resolve,
    reject,
  );
});

gltf.scene.updateMatrixWorld(true);

const out = [];
gltf.scene.traverse((node) => {
  if (!node.isMesh) return;
  const pos = new THREE.Vector3();
  node.getWorldPosition(pos);
  const marker = String(out.length + 1).padStart(2, '0');
  out.push({
    marker,
    nodeName: node.name,
    position: { x: pos.x, y: pos.y, z: pos.z },
  });
});

writeFileSync(join(root, 'tools/positions.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${out.length} Standpunkte → tools/positions.json`);
for (const p of out) console.log(`  ${p.marker}  ${p.nodeName.padEnd(20)} (${p.position.x.toFixed(3)}, ${p.position.y.toFixed(3)}, ${p.position.z.toFixed(3)})`);
