import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  REFERENCE_SPLAT,
  buildSplatAlignment,
  applyAlignmentToSplat,
  applySplatOffset,
} from '/src/lib/splat-alignment.js';

const viewport = document.querySelector('#viewport');
const viewName = document.querySelector('#view-name');
const metrics = document.querySelector('#metrics');
const status = document.querySelector('#status');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x182a26, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
viewport.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
const viewer = new GaussianSplats3D.Viewer({
  selfDrivenMode: false,
  useBuiltInControls: false,
  renderer,
  camera,
  rootElement: viewport,
  sharedMemoryForWorkers: false,
  sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
});
viewer.showInfo = false;
viewer.showMeshCursor = false;
viewer.infoPanel?.hide();

let activeCamera = camera;
let controls = null;
let loaded = false;
const query = new URLSearchParams(window.location.search);
let requestedPreset = query.get('view') || 'top-full';

// World-space ranges derived from all transformed splat centers. The tighter
// reconstruction range excludes a few isolated scan outliers.
const SITE_BOUNDS = Object.freeze({ xMin: -8.912, xMax: 3.964, zMin: -2.704, zMax: 3.854 });

const PRESETS = Object.freeze({
  'top-full': { label: 'Draufsicht · kompletter Scan', kind: 'ortho', center: [-2.474, -0.80, 0.575], width: 13.45 },
  'top-site': { label: 'Draufsicht · Areal mit allen Funktionsbereichen', kind: 'ortho', center: [-0.45, -0.80, -0.42], width: 7.35 },
  'top-campus': { label: 'Draufsicht · kompletter Hofkern', kind: 'ortho', center: [-1.78, -0.80, -1.02], width: 4.65 },
  'top-halls': { label: 'Draufsicht · Hallen und Sandplatz', kind: 'ortho', center: [-2.12, -0.80, -1.03], width: 2.85 },
  'top-piazza': { label: 'Draufsicht · Piazza / Turm / Stallgruppe', kind: 'ortho', center: [-1.22, -0.80, 0.05], width: 2.55 },
  'top-round-pen': { label: 'Draufsicht · Round Pen und Nordrand', kind: 'ortho', center: [-2.82, -0.80, -2.08], width: 2.25 },
  'top-pond': { label: 'Draufsicht · Teich und Pumpenhaus', kind: 'ortho', center: [-4.02, -0.80, -1.48], width: 2.65 },
  'top-large-fields': { label: 'Draufsicht · große südöstliche Koppeln', kind: 'ortho', center: [-0.30, -0.80, 2.02], width: 6.75 },
  'top-crop-field': { label: 'Draufsicht · östliches Ackerfeld und Zufahrt', kind: 'ortho', center: [1.72, -0.80, 0.15], width: 4.85 },
  'top-west': { label: 'Draufsicht · West / Pferdewiesen / Round Pen', kind: 'ortho', center: [-3.72, -0.80, 0.42], width: 4.45 },
  'top-core-west': { label: 'Draufsicht · Hallen / Sandplatz / Pumpenhaus', kind: 'ortho', center: [-2.05, -0.80, -0.77], width: 4.15 },
  'top-core-east': { label: 'Draufsicht · Piazza / Ställe / Turm', kind: 'ortho', center: [-0.98, -0.80, 0.18], width: 3.65 },
  'top-south': { label: 'Draufsicht · Unterkünfte / südliche Plätze', kind: 'ortho', center: [-1.62, -0.80, -1.62], width: 4.30 },
  'top-entry': { label: 'Draufsicht · Zufahrt / Willkommen', kind: 'ortho', center: [1.55, -0.80, 0.62], width: 4.55 },
  'top-north': { label: 'Draufsicht · Atelier / Pferdestall / Wiese', kind: 'ortho', center: [-1.70, -0.80, 1.55], width: 4.50 },
  'oblique-se': { label: 'Schrägansicht · vom Eingang', kind: 'perspective', position: [4.15, 3.05, 4.35], target: [-1.02, -0.62, 0.13], fov: 39 },
  'oblique-sw': { label: 'Schrägansicht · von Südwest', kind: 'perspective', position: [-5.65, 3.12, -4.25], target: [-1.20, -0.55, 0.08], fov: 42 },
  'oblique-nw': { label: 'Schrägansicht · von Nordwest', kind: 'perspective', position: [-5.75, 3.38, 4.20], target: [-1.15, -0.58, 0.18], fov: 41 },
  'oblique-ne': { label: 'Schrägansicht · von Nordost', kind: 'perspective', position: [3.65, 3.25, 4.20], target: [-1.15, -0.58, 0.18], fov: 41 },
  'oblique-core-east': { label: 'Nahansicht · Hofkern von Ost', kind: 'perspective', position: [0.82, 1.18, 1.18], target: [-1.32, -0.66, 0.02], fov: 48 },
  'oblique-core-west': { label: 'Nahansicht · Hofkern von West', kind: 'perspective', position: [-3.48, 1.28, 0.92], target: [-1.42, -0.67, -0.18], fov: 48 },
  'oblique-halls': { label: 'Nahansicht · Hallen und Sandplatz', kind: 'perspective', position: [-3.72, 1.42, -2.78], target: [-2.05, -0.70, -1.08], fov: 49 },
  'oblique-north-houses': { label: 'Nahansicht · nördliche Häusergruppe', kind: 'perspective', position: [0.62, 1.22, -2.74], target: [-0.92, -0.68, -1.55], fov: 48 },
  'oblique-pond': { label: 'Nahansicht · Teich / Pumpenhaus / Round Pen', kind: 'perspective', position: [-5.34, 1.18, -2.56], target: [-3.72, -0.72, -1.58], fov: 49 },
  'oblique-entry': { label: 'Nahansicht · Zufahrt und östliche Plätze', kind: 'perspective', position: [3.58, 1.04, 2.12], target: [0.62, -0.72, 0.58], fov: 47 },
});

const sizeRenderer = () => {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  activeCamera.aspect = width / height;
  if (activeCamera.isPerspectiveCamera) activeCamera.updateProjectionMatrix();
};

function setPreset(name) {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`Unbekannte Ansicht: ${name}`);
  requestedPreset = name;
  const aspect = Math.max(0.1, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  if (preset.kind === 'ortho') {
    // The Gaussian renderer becomes unreliable with a true orthographic camera
    // at exactly 90 degrees. A long-lens perspective camera gives a practically
    // orthogonal survey view while keeping every splat visible.
    const topFov = 28;
    const topDistance = (preset.width / aspect / 2) / Math.tan(THREE.MathUtils.degToRad(topFov / 2));
    const top = new THREE.PerspectiveCamera(topFov, aspect, 0.01, 100);
    top.position.set(preset.center[0], preset.center[1] + topDistance, preset.center[2]);
    top.up.set(0, 0, -1);
    top.lookAt(preset.center[0], preset.center[1], preset.center[2]);
    top.updateProjectionMatrix();
    activeCamera = top;
    metrics.textContent = `Zentrum x ${preset.center[0].toFixed(3)} / z ${preset.center[2].toFixed(3)} · Breite ${preset.width.toFixed(2)} Splat-Einheiten`;
  } else {
    camera.fov = preset.fov;
    camera.position.fromArray(preset.position);
    camera.lookAt(new THREE.Vector3().fromArray(preset.target));
    camera.updateProjectionMatrix();
    activeCamera = camera;
    metrics.textContent = `Kamera ${preset.position.map((v) => v.toFixed(2)).join(' / ')} · Ziel ${preset.target.map((v) => v.toFixed(2)).join(' / ')}`;
  }
  viewer.camera = activeCamera;
  viewName.textContent = preset.label;
  sizeRenderer();
  return { name, ...preset, bounds: SITE_BOUNDS };
}

function setOrtho({ x, z, width, label = 'Benutzerdefinierte Draufsicht' }) {
  const name = '__custom__';
  const aspect = Math.max(0.1, viewport.clientWidth / Math.max(1, viewport.clientHeight));
  const topFov = 28;
  const topDistance = (width / aspect / 2) / Math.tan(THREE.MathUtils.degToRad(topFov / 2));
  const top = new THREE.PerspectiveCamera(topFov, aspect, 0.01, 100);
  top.position.set(x, -0.8 + topDistance, z);
  top.up.set(0, 0, -1);
  top.lookAt(x, -0.8, z);
  top.updateProjectionMatrix();
  activeCamera = top;
  viewer.camera = activeCamera;
  viewName.textContent = label;
  metrics.textContent = `Zentrum x ${x.toFixed(3)} / z ${z.toFixed(3)} · Breite ${width.toFixed(2)} Splat-Einheiten`;
  sizeRenderer();
  return { name, kind: 'ortho', center: [x, -0.8, z], width, bounds: SITE_BOUNDS };
}

function setClean(clean = true) {
  document.body.classList.toggle('clean', clean);
}

function getState() {
  return { loaded, requestedPreset, bounds: SITE_BOUNDS, size: [viewport.clientWidth, viewport.clientHeight] };
}

window.__splatReference = { PRESETS, SITE_BOUNDS, setPreset, setOrtho, setClean, getState, renderer, viewer };

if (query.get('clean') === '1') setClean(true);
if (!(requestedPreset in PRESETS)) requestedPreset = 'top-full';

async function load() {
  status.textContent = 'Ausrichtung und Marker-Anker werden geladen …';
  let alignment = buildSplatAlignment(null);
  try {
    const gltf = await new GLTFLoader().loadAsync('/Paasleben.glb');
    alignment = buildSplatAlignment(gltf.scene);
  } catch (error) {
    console.warn('GLB-Anker nicht geladen; Fallback-Ausrichtung wird verwendet.', error);
  }
  status.textContent = 'KSplat wird geladen …';
  await viewer.addSplatScene('/scene.ksplat', {
    showLoadingUI: false,
    progressiveLoad: false,
    splatAlphaRemovalThreshold: 0,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  applyAlignmentToSplat(viewer.splatMesh, alignment);
  applySplatOffset(viewer.splatMesh, {
    position: viewer.splatMesh.position.clone(),
    quaternion: viewer.splatMesh.quaternion.clone(),
    scale: viewer.splatMesh.scale.clone(),
  }, REFERENCE_SPLAT);
  viewer.splatMesh.setSplatScale(1);
  loaded = true;
  status.textContent = 'Bereit · echte scene.ksplat';
  setPreset(requestedPreset);
  window.dispatchEvent(new CustomEvent('splat-reference-ready'));
}

function animate() {
  requestAnimationFrame(animate);
  if (!loaded) return;
  viewer.update();
  viewer.render();
}

new ResizeObserver(() => {
  if (requestedPreset in PRESETS) setPreset(requestedPreset);
  else sizeRenderer();
}).observe(viewport);
sizeRenderer();
setPreset(requestedPreset);
animate();
load().catch((error) => {
  status.textContent = `Fehler: ${error.message}`;
  console.error(error);
});
