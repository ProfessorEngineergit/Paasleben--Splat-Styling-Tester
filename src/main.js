import './style.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

import { initTheme } from './lib/paas-theme.js';
import { PaasLoader } from './lib/paas-loader.js';
import { PaasCursor } from './lib/paas-cursor.js';
import { PaasPanel } from './lib/paas-panel.js';
import { createSky } from './lib/paas-sky.js';
import { fetchLocations, resolveImages } from './lib/locations.js';
import {
  REFERENCE_SPLAT, REFERENCE_CAMERA,
  buildSplatAlignment as buildSplatAlignmentShared,
  applyAlignmentToSplat, applySplatOffset,
} from './lib/splat-alignment.js';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.ksplat`;
const MODEL_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;

const STYLE = {
  bg: '#f4ecd8',
  splatScale: 1,
  splatRotation: -28,
};


const DEFAULT_MOVE_BOUNDS = {
  minX: -3.8, maxX: 3.1,
  minZ: -2.25, maxZ: 2.05,
};
const MOVE_BOUNDS_PADDING = 0.75;
const MOVE_RUBBER_LIMIT = 0.55;
const MOVE_RUBBER_SOFTNESS = 0.9;
const MOVE_EDGE_SOFT_ZONE = 0.9;
const MOVE_EDGE_MIN_FACTOR = 0.12;
const MOVE_BOUNDS_REBOUND_INSET = 0.035;
const DRAG_CAMERA_FOV_ZOOM = 0.9;
const DRAG_PAN_RIGHT_SPEED = 0.0125;
const DRAG_PAN_FORWARD_SPEED = 0.015;
const DRAG_INERTIA_MULTIPLIER = 3.75;
const DRAG_INERTIA_MAX = 0.42;

// ── Hochformat-Rahmung ─────────────────────────────────────────────────
// Die Kameraführung ist für breite Fenster austariert (Referenz 16:9). Weil
// THREE die FOV *vertikal* definiert, schrumpft das horizontale Blickfeld auf
// hohen, schmalen Displays drastisch: 16:9 ergibt 91°, ein iPhone im
// Hochformat nur noch 30°. Vom Areal blieb dadurch gut ein Viertel der Breite
// sichtbar — die Gebäude als schmaler Streifen oben, darunter leere Wiese.
// Das war der „schief/nach hinten verbogen"-Eindruck auf dem Handy.
// Gegenmaßnahme in drei Teilen: vertikale FOV moderat weiten, den Rest über
// Kameradistanz ausgleichen und den Blick zur Mitte des Areals nachführen.
// FOV und Distanz sind gedeckelt — sonst entsteht Fischauge-Verzerrung bzw.
// die unscharfen Splat-Ränder geraten ins Bild. Ab 16:9 aufwärts bleibt alles
// unverändert wie bisher.
const VIEW_REFERENCE_ASPECT = 16 / 9;
const VIEW_BASE_FOV = 60;
const VIEW_MAX_FOV = 72;
const VIEW_MAX_DIST_SCALE = 1.9;
// Erst ab deutlich schmalen Fenstern eingreifen: Notebook- und Desktop-Formate
// (16:10 = 1.6, 3:2 = 1.5, 4:3 = 1.33) bleiben dadurch exakt so wie bisher.
// Zwischen den beiden Schwellen wird die Anpassung stufenlos eingeblendet,
// damit beim Verkleinern des Fensters nichts springt.
const VIEW_FIT_START_ASPECT = 1.2;
const VIEW_FIT_FULL_ASPECT = 0.55;
// Mittel der Standpunkt-Positionen = Mitte des bebauten Areals. Dorthin
// wandert der Blick im Hochformat, damit die Gebäude im Bild zentriert sind
// statt an den Rand zu rutschen.
const VIEW_PORTRAIT_AIM = { x: -1.424, y: 0.21, z: -0.457 };
// Nicht ganz auf die Mitte ziehen: „Willkommen" (Nr. 01) liegt abseits der
// übrigen Standpunkte und rutscht bei vollem Nachführen aus dem Bild — es
// landet dann fast unter der Kamera. Bei 0.7 sind nachgemessen alle 16
// Standpunkte im Bild, bei 0.85 fehlt der erste.
const VIEW_MAX_AIM_BLEND = 0.7;

// ── Bewegungsspielraum auf Touch-Geräten ───────────────────────────────
// Auf dem Handy wird nicht frei durch die Szene gefahren. Freies Panning führt
// dort schnell an die unscharfen Ränder des Splats und man verliert die
// Orientierung; navigiert wird stattdessen über die Zeitleiste. Was bleibt, ist
// ein kleiner Blickspielraum um den aktuellen Standpunkt — gerade so viel, dass
// sich die Ansicht lebendig anfühlt.
const LOOK_YAW_LIMIT_DEG = 6;    // ±6° ⇒ 12° Gesamtschwenk
const LOOK_PITCH_LIMIT_DEG = 4;
const LOOK_YAW_SPEED = 0.0042;   // Radiant pro Pixel Zeigerbewegung
const LOOK_PITCH_SPEED = 0.0032;

// Standpunkt-Daten (Namen, Nummern, Texte, Bilder, Positionen) kommen aus
// Firestore (`paas_locations`), gepflegt über den Editor unter /admin.html.
// Fallback bei fehlender Verbindung: src/data/locations-snapshot.json.

// ── CSV-Content (nur UI-Rahmen) ────────────────────────────────────────
// public/content.csv liefert nur noch die Rahmentexte der Seite (eyebrow,
// mainTitle, lede, …) über [data-content-key]-Elemente. Die Ortstexte
// (place_*) kommen aus Firestore und werden hier ignoriert.
const SHEET_CSV_URL = (import.meta.env && import.meta.env.VITE_SHEET_CSV_URL)
  || `${import.meta.env.BASE_URL}content.csv`;

const sheetContent = Object.create(null);

const parseCSV = (text) => {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const applySheetContentToDOM = () => {
  document.querySelectorAll('[data-content-key]').forEach((el) => {
    const key = el.getAttribute('data-content-key');
    const value = sheetContent[key];
    if (typeof value === 'string' && value.length) el.textContent = value;
  });
};

const loadSheetContent = async () => {
  if (!SHEET_CSV_URL) return;
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const rows = parseCSV(await res.text());
    for (const row of rows) {
      if (!row || !row.length) continue;
      const key = (row[0] || '').trim();
      const value = (row[1] ?? '').trim();
      if (!key || /^key$/i.test(key)) continue;
      sheetContent[key] = value;
    }
    applySheetContentToDOM();
  } catch (err) {
    console.warn('Sheet-Content konnte nicht geladen werden:', err);
  }
};

loadSheetContent();

// Theme aus Firestore anwenden (paas_config/site). Absichtlich nicht
// abgewartet: der zwischengespeicherte Wert steht sofort, der verbindliche
// kommt nach — das Laden der Szene soll darauf nicht warten.
initTheme();

// ── Deep-Link & Editor-Vorschau ────────────────────────────────────────
// ?ort=NN  → nach dem Laden direkt diesen Standpunkt öffnen (Intro entfällt)
// ?edit=1  → Panel-Texte editierbar (nur sinnvoll im iframe des Editors;
//            Änderungen gehen per postMessage an den Editor, der speichert)
const URL_PARAMS = new URLSearchParams(location.search);
const DEEP_LINK_ORT = URL_PARAMS.get('ort');
const EDIT_MODE = URL_PARAMS.get('edit') === '1';

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE_POINTER = matchMedia('(pointer: coarse)').matches;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Liefert zum Seitenverhältnis die passende Rahmung (siehe VIEW_*-Konstanten).
// `aimBlend` läuft von 0 (breites Fenster, alles wie bisher) bis 1 (extremes
// Hochformat, Blick voll auf die Areal-Mitte) und hält den Übergang stufenlos.
const fitForAspect = (aspect) => {
  const unchanged = { fov: VIEW_BASE_FOV, distScale: 1, aimBlend: 0 };
  if (!(aspect > 0) || aspect >= VIEW_FIT_START_ASPECT) return unchanged;
  // 0 an der oberen Schwelle, 1 im ausgeprägten Hochformat.
  const engage = clamp(
    (VIEW_FIT_START_ASPECT - aspect) / (VIEW_FIT_START_ASPECT - VIEW_FIT_FULL_ASPECT),
    0, 1,
  );
  // Zielwerte: so viel horizontales Blickfeld zurückholen, wie 16:9 hätte —
  // begrenzt durch VIEW_MAX_FOV, der Rest über die Distanz.
  const wantTanH = Math.tan(THREE.MathUtils.degToRad(VIEW_BASE_FOV / 2)) * VIEW_REFERENCE_ASPECT;
  const maxTanV = Math.tan(THREE.MathUtils.degToRad(VIEW_MAX_FOV / 2));
  const tanV = Math.min(wantTanH / aspect, maxTanV);
  const fullFov = THREE.MathUtils.radToDeg(2 * Math.atan(tanV));
  const fullDistScale = clamp(wantTanH / (tanV * aspect), 1, VIEW_MAX_DIST_SCALE);
  return {
    fov: VIEW_BASE_FOV + (fullFov - VIEW_BASE_FOV) * engage,
    distScale: 1 + (fullDistScale - 1) * engage,
    aimBlend: engage * VIEW_MAX_AIM_BLEND,
  };
};
// buildSplatAlignment mit dem projektspezifischen Fallback-Yaw aus STYLE.
const buildSplatAlignment = (gltfScene) => buildSplatAlignmentShared(gltfScene, STYLE.splatRotation);

const boot = async () => {
  const root = document.querySelector('#app');
  const viewport = document.querySelector('#viewport');
  const sceneVeil = document.querySelector('.scene-veil');
  const markerLayer = document.querySelector('#marker-layer');
  if (!root || !viewport || !sceneVeil || !markerLayer) return;

  // ── Loader ─────────────────────────────
  const manager = new THREE.LoadingManager();
  const loader = new PaasLoader({
    text: 'Ein Ort zum Atmen. Ein Ort für Skulpturen.',
    manager,
  });

  // ── Renderer / Camera ──────────────────
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(STYLE.bg, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  let pixelRatio = Math.min(window.devicePixelRatio, COARSE_POINTER ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(
    REFERENCE_CAMERA.position.x,
    REFERENCE_CAMERA.position.y,
    REFERENCE_CAMERA.position.z,
  );

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

  if (viewer.scene && viewer.scene.fog === null) {
    // some Viewer versions expose .scene only after add; safe-guard:
    try { viewer.scene.fog = new THREE.Fog(0xf4ecd8, 8, 30); } catch {}
  }

  const orbit = new GaussianSplats3D.OrbitControls(camera, renderer.domElement);
  orbit.target.set(REFERENCE_CAMERA.target.x, REFERENCE_CAMERA.target.y, REFERENCE_CAMERA.target.z);
  orbit.enableDamping = true;
  orbit.enableZoom = false;
  orbit.enablePan = false;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 14;
  orbit.minPolarAngle = Math.PI * 0.28;
  orbit.maxPolarAngle = Math.PI * 0.495; // never go below horizon
  orbit.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  orbit.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  orbit.update();

  const cameraHome = {
    position: camera.position.clone(),
    target: orbit.target.clone(),
  };

  let renderInvalidated = true;
  const invalidate = () => { renderInvalidated = true; };

  // Unveränderte Referenz-Rahmung (breites Fenster). cameraHome wird daraus
  // je Seitenverhältnis abgeleitet; ohne diese Basis würde jede erneute
  // Anpassung auf der bereits angepassten Ansicht aufsetzen und sich addieren.
  const homeBase = {
    position: camera.position.clone(),
    target: orbit.target.clone(),
  };

  // true, sobald homeBase die echten (ausgerichteten) Werte hält.
  let viewFitReady = false;

  // Leitet die Heim-Ansicht aus homeBase + Seitenverhältnis ab.
  const applyViewFit = () => {
    const fit = fitForAspect(camera.aspect);
    const dir = homeBase.position.clone().sub(homeBase.target);
    const baseDist = dir.length();
    if (!baseDist) return;
    dir.normalize();
    const aim = new THREE.Vector3(VIEW_PORTRAIT_AIM.x, VIEW_PORTRAIT_AIM.y, VIEW_PORTRAIT_AIM.z);
    cameraHome.target.copy(homeBase.target).lerp(aim, fit.aimBlend);
    cameraHome.position.copy(cameraHome.target)
      .add(dir.multiplyScalar(clamp(baseDist * fit.distScale, orbit.minDistance, orbit.maxDistance)));
  };

  // Einflug in die Szene: aus der Höhe und Ferne auf die Heim-Ansicht zu.
  //
  // Die Kamera wird dabei direkt gefahren, nicht über die Orbit-Steuerung —
  // sonst würde deren Klammer (maxDistance 14, minPolarAngle) den Startpunkt
  // sofort wieder hereinziehen und aus dem Flug ein Ruckeln machen. Am Ende
  // steht die Kamera exakt auf cameraHome, also innerhalb aller Grenzen; das
  // abschließende orbit.update() verschiebt daher nichts mehr.
  // Läuft der Einflug, darf die Render-Schleife orbit.update() nicht aufrufen:
  // update() klammert Distanz und Neigung auch bei enabled:false und zog den
  // Startpunkt sonst von 16,5 auf maxDistance 14 zurück — der Flug begann
  // dadurch zu dicht und zu flach.
  let introFlying = false;

  const playIntroFlight = () => new Promise((done) => {
    const home = cameraHome.position.clone();
    const target = cameraHome.target.clone();
    const dir = home.clone().sub(target);
    const dist = dir.length();
    if (REDUCED_MOTION || !dist) { done(); return; }
    dir.normalize();

    // Start: deutlich weiter draußen und höher — der Blick beginnt über dem
    // Areal und senkt sich hinein. Nicht weiter, weil der Splat nach außen hin
    // unscharf wird und der Flug sonst zu lange durch Matsch führt.
    const start = target.clone().add(dir.clone().multiplyScalar(dist * 2.6));
    start.y += dist * 1.15;

    orbit.enabled = false;
    introFlying = true;
    // Startpunkt sofort einnehmen, nicht erst beim ersten Tween-Tick: sonst
    // steht das erste Bild noch auf der Heim-Ansicht und springt dann nach
    // außen, bevor der Flug beginnt.
    camera.position.copy(start);
    camera.lookAt(target);
    invalidate();
    const fly = { t: 0 };
    const pos = new THREE.Vector3();
    const DUR = 3.4;

    // Genau einmal aufräumen, egal ob der Flug durchlief oder abgebrochen
    // wurde. gsap hängt an requestAnimationFrame: in einem Hintergrund-Tab
    // läuft der Ticker nicht, onComplete käme dort nie — ohne die Reissleine
    // unten bliebe boot() für immer stehen und die Seite nie bedienbar.
    let fertig = false;
    let reissleine;
    const abschliessen = (tween) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(reissleine);
      tween?.kill();
      introFlying = false;
      camera.position.copy(home);
      orbit.target.copy(target);
      orbit.enabled = true;
      orbit.update();
      captureLookAnchor();
      invalidate();
      done();
    };

    const tween = gsap.to(fly, {
      t: 1,
      duration: DUR,
      ease: 'power2.inOut',
      onUpdate: () => {
        pos.lerpVectors(start, home, fly.t);
        // Leichter Bogen: die Bahn hängt in der Mitte etwas durch, damit der
        // Flug nicht wie eine gerade Schiene wirkt.
        pos.y += Math.sin(fly.t * Math.PI) * dist * 0.12;
        camera.position.copy(pos);
        camera.lookAt(target);
        invalidate();
      },
      onComplete: () => abschliessen(tween),
    });
    reissleine = setTimeout(() => abschliessen(tween), DUR * 1000 + 1500);
  });

  // Zieht die Rahmung nach, solange der Nutzer die Ansicht noch nicht selbst
  // bewegt hat. Nötig, weil der Viewport beim ersten resize() noch 0×0 sein
  // kann (etwa in einem Hintergrund-Tab): dann greift resize() nicht und das
  // Seitenverhältnis bleibt beim Platzhalter 1:1 stehen — die Rahmung wäre
  // dauerhaft falsch. Bewegt der Nutzer bereits, bleibt die Kamera stehen und
  // nur der Heim-Punkt wandert mit; so setzt der FPS-Regler, der ebenfalls
  // resize() auslöst, niemandem mitten im Ziehen die Ansicht zurück.
  const refitViewIfUntouched = () => {
    if (!viewFitReady) return;
    const atHome = camera.position.distanceToSquared(cameraHome.position) < 1e-6
      && orbit.target.distanceToSquared(cameraHome.target) < 1e-6;
    applyViewFit();
    if (!atHome) return;
    camera.position.copy(cameraHome.position);
    orbit.target.copy(cameraHome.target);
    orbit.update();
    invalidate();
  };

  const lastCamPos = camera.position.clone();
  const lastTarget = orbit.target.clone();
  const lastQuat = camera.quaternion.clone();
  const hasViewChanged = () => {
    const a = camera.position.distanceToSquared(lastCamPos) > 1e-7;
    const b = orbit.target.distanceToSquared(lastTarget) > 1e-7;
    const c = 1 - Math.abs(camera.quaternion.dot(lastQuat)) > 1e-8;
    if (a) lastCamPos.copy(camera.position);
    if (b) lastTarget.copy(orbit.target);
    if (c) lastQuat.copy(camera.quaternion);
    return a || b || c;
  };

  const resize = () => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    // Hier nur die FOV nachziehen: sie hängt allein am Seitenverhältnis und
    // ist damit idempotent, egal wo der Nutzer gerade steht. Position und Ziel
    // setzt applyViewFit().
    camera.fov = fitForAspect(camera.aspect).fov;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    refitViewIfUntouched();
    invalidate();
  };
  new ResizeObserver(resize).observe(viewport);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize();

  // ── Pan-only drag (no rotate, like before) ─────
  const previousPointer = new THREE.Vector2();
  let isDragging = false;
  let interactionLocked = true; // unlocked when loader done
  let debugMovementUnlocked = false;
  let dragCameraBaseFov = null;
  const dragVelocity = new THREE.Vector3();
  const moveBounds = { ...DEFAULT_MOVE_BOUNDS };
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const rubberClamp = (v, min, max) => {
    if (v < min) {
      const over = min - v;
      return min - MOVE_RUBBER_LIMIT * (1 - Math.exp(-over / MOVE_RUBBER_SOFTNESS));
    }
    if (v > max) {
      const over = v - max;
      return max + MOVE_RUBBER_LIMIT * (1 - Math.exp(-over / MOVE_RUBBER_SOFTNESS));
    }
    return v;
  };

  const resistedAxis = (value, delta, min, max) => {
    if (!delta) return value;
    const movingTowardMin = delta < 0;
    const edgeDistance = movingTowardMin ? value - min : max - value;
    let factor = 1;
    if (edgeDistance < MOVE_EDGE_SOFT_ZONE) {
      const t = clamp(edgeDistance / MOVE_EDGE_SOFT_ZONE, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      factor = MOVE_EDGE_MIN_FACTOR + (1 - MOVE_EDGE_MIN_FACTOR) * smooth;
    }
    return rubberClamp(value + delta * factor, min, max);
  };

  const updateCameraFov = () => {
    camera.updateProjectionMatrix();
    invalidate();
  };

  const startDragCameraZoom = () => {
    if (dragCameraBaseFov === null) dragCameraBaseFov = camera.fov;
    gsap.killTweensOf(camera, 'fov');
    gsap.to(camera, {
      fov: Math.max(35, dragCameraBaseFov - DRAG_CAMERA_FOV_ZOOM),
      duration: REDUCED_MOTION ? 0.001 : 0.34,
      ease: 'power3.out',
      onUpdate: updateCameraFov,
    });
  };

  const releaseDragCameraZoom = (fast = false) => {
    if (dragCameraBaseFov === null) return;
    const fov = dragCameraBaseFov;
    gsap.killTweensOf(camera, 'fov');
    gsap.to(camera, {
      fov,
      duration: REDUCED_MOTION ? 0.001 : (fast ? 0.18 : 0.78),
      ease: 'power4.out',
      onUpdate: updateCameraFov,
      onComplete: () => {
        camera.fov = fov;
        camera.updateProjectionMatrix();
        dragCameraBaseFov = null;
      },
    });
  };

  const isOutsideMovementBounds = () => (
    orbit.target.x < moveBounds.minX ||
    orbit.target.x > moveBounds.maxX ||
    orbit.target.z < moveBounds.minZ ||
    orbit.target.z > moveBounds.maxZ
  );

  const updateMovementBounds = () => {
    if (!standpoints.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const sp of standpoints) {
      minX = Math.min(minX, sp.world.x);
      maxX = Math.max(maxX, sp.world.x);
      minZ = Math.min(minZ, sp.world.z);
      maxZ = Math.max(maxZ, sp.world.z);
    }
    moveBounds.minX = minX - MOVE_BOUNDS_PADDING;
    moveBounds.maxX = maxX + MOVE_BOUNDS_PADDING;
    moveBounds.minZ = minZ - MOVE_BOUNDS_PADDING;
    moveBounds.maxZ = maxZ + MOVE_BOUNDS_PADDING;
  };

  const reboundToMovementBounds = () => {
    if (debugMovementUnlocked) return;
    const nextTarget = orbit.target.clone();
    nextTarget.x = clamp(
      nextTarget.x,
      moveBounds.minX + MOVE_BOUNDS_REBOUND_INSET,
      moveBounds.maxX - MOVE_BOUNDS_REBOUND_INSET,
    );
    nextTarget.z = clamp(
      nextTarget.z,
      moveBounds.minZ + MOVE_BOUNDS_REBOUND_INSET,
      moveBounds.maxZ - MOVE_BOUNDS_REBOUND_INSET,
    );
    const delta = nextTarget.clone().sub(orbit.target);
    if (delta.lengthSq() < 1e-8) return;
    const nextCamera = camera.position.clone().add(delta);

    gsap.killTweensOf(camera.position, 'x,z');
    gsap.killTweensOf(orbit.target, 'x,z');
    gsap.to(orbit.target, {
      x: nextTarget.x,
      z: nextTarget.z,
      duration: REDUCED_MOTION ? 0.001 : 0.82,
      ease: 'power4.out',
      onUpdate: invalidate,
    });
    gsap.to(camera.position, {
      x: nextCamera.x,
      z: nextCamera.z,
      duration: REDUCED_MOTION ? 0.001 : 0.82,
      ease: 'power4.out',
      onUpdate: invalidate,
    });
  };

  const moveByWorldDelta = (move) => {
    const prev = orbit.target.clone();
    if (debugMovementUnlocked) {
      orbit.target.add(move);
    } else {
      orbit.target.set(
        resistedAxis(orbit.target.x, move.x, moveBounds.minX, moveBounds.maxX),
        orbit.target.y,
        resistedAxis(orbit.target.z, move.z, moveBounds.minZ, moveBounds.maxZ),
      );
    }
    camera.position.add(orbit.target.clone().sub(prev));
    invalidate();
  };

  const glideAfterDrag = () => {
    if (dragVelocity.lengthSq() < 1e-7) {
      reboundToMovementBounds();
      return;
    }
    const glide = dragVelocity.clone().multiplyScalar(DRAG_INERTIA_MULTIPLIER);
    if (glide.length() > DRAG_INERTIA_MAX) glide.setLength(DRAG_INERTIA_MAX);
    const state = { t: 0 };
    gsap.killTweensOf(camera.position, 'x,z');
    gsap.killTweensOf(orbit.target, 'x,z');
    gsap.to(state, {
      t: 1,
      duration: REDUCED_MOTION ? 0.001 : 0.42,
      ease: 'power4.out',
      onUpdate: () => {
        const step = glide.clone().multiplyScalar(state.t - (state.prev ?? 0));
        state.prev = state.t;
        moveByWorldDelta(step);
      },
      onComplete: reboundToMovementBounds,
    });
  };

  const applyPan = (dx, dy) => {
    gsap.killTweensOf(camera.position, 'x,z');
    gsap.killTweensOf(orbit.target, 'x,z');
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) return;
    forward.normalize();
    right.copy(up).cross(forward).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(right, dx * DRAG_PAN_RIGHT_SPEED);
    move.addScaledVector(forward, dy * DRAG_PAN_FORWARD_SPEED);
    dragVelocity.lerp(move, 0.35);
    moveByWorldDelta(move);
  };

  // ── Begrenzter Blickspielraum (Touch) ──────────────────────────────
  // Der Anker ist die Blickrichtung, mit der die Kamera am aktuellen Ort
  // angekommen ist; der Nutzer darf sich davon nur um LOOK_*_LIMIT entfernen.
  // Der Versatz wird selbst mitgeführt statt aus der Kamera zurückgelesen —
  // Rücklesen über Spherical.theta bricht am Übergang bei ±π.
  const RESTRICTED_LOOK = COARSE_POINTER;
  let lookAnchor = null;
  const lookOffset = { yaw: 0, pitch: 0 };
  const lookSph = new THREE.Spherical();
  const lookVec = new THREE.Vector3();

  const captureLookAnchor = () => {
    lookSph.setFromVector3(lookVec.copy(camera.position).sub(orbit.target));
    lookAnchor = { radius: lookSph.radius, phi: lookSph.phi, theta: lookSph.theta };
    lookOffset.yaw = 0;
    lookOffset.pitch = 0;
  };

  const applyLimitedLook = (dx, dy) => {
    if (!lookAnchor) captureLookAnchor();
    const yawMax = THREE.MathUtils.degToRad(LOOK_YAW_LIMIT_DEG);
    const pitchMax = THREE.MathUtils.degToRad(LOOK_PITCH_LIMIT_DEG);
    lookOffset.yaw = clamp(lookOffset.yaw - dx * LOOK_YAW_SPEED, -yawMax, yawMax);
    lookOffset.pitch = clamp(lookOffset.pitch - dy * LOOK_PITCH_SPEED, -pitchMax, pitchMax);
    lookSph.set(
      lookAnchor.radius,
      clamp(lookAnchor.phi + lookOffset.pitch, orbit.minPolarAngle, orbit.maxPolarAngle),
      lookAnchor.theta + lookOffset.yaw,
    );
    camera.position.copy(orbit.target).add(lookVec.setFromSpherical(lookSph));
    camera.lookAt(orbit.target);
    invalidate();
  };

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (interactionLocked) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    dragVelocity.set(0, 0, 0);
    previousPointer.set(e.clientX, e.clientY);
    startDragCameraZoom();
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!isDragging || interactionLocked) return;
    const dx = e.clientX - previousPointer.x;
    const dy = e.clientY - previousPointer.y;
    previousPointer.set(e.clientX, e.clientY);
    if (RESTRICTED_LOOK) applyLimitedLook(dx, dy);
    else applyPan(dx, dy);
  });
  const stop = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    releaseDragCameraZoom(RESTRICTED_LOOK ? false : isOutsideMovementBounds());
    // Nachgleiten und Rueckfedern gehoeren zum freien Fahren; im begrenzten
    // Blickspielraum gibt es keine Grenze, an die man stossen koennte.
    if (!RESTRICTED_LOOK) glideAfterDrag();
  };
  renderer.domElement.addEventListener('pointerup', stop);
  renderer.domElement.addEventListener('pointercancel', stop);

  // ── Standpoints / Markers ──────────────
  const standpoints = []; // { id, marker, name, subtitle, body, world: Vector3 }
  const markers = [];     // { data, el }
  const projTmp = new THREE.Vector3();

  const buildMarkerEl = (sp) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'schild-marker';
    btn.dataset.marker = '';
    btn.dataset.id = sp.id;
    btn.setAttribute('aria-label', `${sp.display} — ${sp.name} — öffnen`);
    // sm-badge ist die Hochformat-Variante: nur die Nummer als kleine
    // Plakette. Die vollen Schilder sind ~140px breit und überdeckten sich auf
    // schmalen Displays zu einer unlesbaren Wand. Welche der beiden sichtbar
    // ist, entscheidet allein CSS (siehe style.css, max-width: 640px).
    btn.innerHTML = `
      <span class="sm-card">
        <span class="sm-num">Nr. ${sp.display}</span>
        <span class="sm-title">${sp.name}</span>
      </span>
      <span class="sm-badge" aria-hidden="true">${sp.display}</span>
      <span class="sm-stem" aria-hidden="true"></span>
      <span class="sm-dot" aria-hidden="true"></span>
    `;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openStandpoint(sp);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openStandpoint(sp);
      }
    });
    markerLayer.appendChild(btn);
    return btn;
  };

  // Sichtbarkeit als weicher, framerate-unabhängiger Wert statt binärem
  // 0/1-Umschalten: an der Bildkante kippte `visible` sonst frameweise und
  // startete jedes Mal die CSS-Blende neu — das war das Flackern beim
  // schnellen Drehen. Hysterese (später aus- als einblenden) verhindert das
  // Pendeln, das Style-Diffing spart Schreibzugriffe im Ruhezustand.
  let markerLast = performance.now();
  const updateMarkers = () => {
    const now = performance.now();
    const dt = Math.min(100, now - markerLast);
    markerLast = now;
    const k = 1 - Math.exp(-dt / 90);
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;

    for (const m of markers) {
      projTmp.copy(m.data.world).project(camera);
      const drin = projTmp.z > -1 && projTmp.z < (m.alpha > 0.5 ? 1.0 : 0.995);
      const ziel = drin ? 1 : 0;

      m.alpha += (ziel - m.alpha) * k;
      if (Math.abs(ziel - m.alpha) < 0.004) m.alpha = ziel;

      const x = (projTmp.x * 0.5 + 0.5) * w;
      const y = (-projTmp.y * 0.5 + 0.5) * h;

      if (drin && (Math.abs(x - m.lastX) > 0.4 || Math.abs(y - m.lastY) > 0.4)) {
        m.el.style.setProperty('--mx', `${x.toFixed(1)}px`);
        m.el.style.setProperty('--my', `${y.toFixed(1)}px`);
        m.lastX = x; m.lastY = y;
      }
      if (Math.abs(m.alpha - m.lastA) > 0.005) {
        m.el.style.opacity = m.alpha.toFixed(3);
        m.lastA = m.alpha;
      }
      const klickbar = m.alpha > 0.5;
      if (klickbar !== m.pe) {
        m.el.style.pointerEvents = klickbar ? 'auto' : 'none';
        m.pe = klickbar;
      }
    }
  };

  // Hinweis: kein eigener rAF-Loop mehr — updateMarkers() läuft am Ende
  // von animate() (siehe unten), damit die Projektion die Kameramatrix
  // desselben Frames benutzt.

  // ── Panel + camera tween ───────────────
  const panel = new PaasPanel({ sceneVeil });

  // Jeder Schließweg (Escape im Panel, Knopf, Tipp-Zone, Overscroll) bricht
  // ein noch wartendes, verzögertes Öffnen ab.
  let pendingOpenTimer = 0;
  let pendingOpenCancelled = false;
  // Zusätzlich eine Markierung am <body>: daran hängt das Ausblenden der
  // Zeitleiste, die sonst hinter dem Panel durchschimmert. Die Klassen des
  // Panels selbst liegen am Panel-Element, das kein Geschwister der Leiste ist
  // — deshalb hier und nicht per CSS-Nachbarschaft.
  const panelClose = panel.close.bind(panel);
  panel.close = () => {
    clearTimeout(pendingOpenTimer);
    pendingOpenCancelled = true;
    document.body.classList.remove('pp-is-open');
    panelClose();
  };
  const panelOpen = panel.open.bind(panel);
  panel.open = (data) => {
    document.body.classList.add('pp-is-open');
    panelOpen(data);
  };

  // Inject fold-line shape + close button INSIDE the head, directly above the title.
  const head = panel.el.querySelector('.pp-head');
  const folds = document.createElement('div');
  folds.className = 'pp-folds';
  folds.innerHTML = `
    <svg class="pp-folds-svg" viewBox="0 0 1600 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="pp-folds-shadow" x="-2%" y="-50%" width="104%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" />
          <feOffset dx="0" dy="1.5" result="off" />
          <feComponentTransfer><feFuncA type="linear" slope="0.45" /></feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#pp-folds-shadow)">
        <path d="M 0 100 L 360 18 L 1240 18 L 1600 100"
              fill="none" stroke="#f4ecd8" stroke-width="4"
              stroke-linejoin="round" stroke-linecap="round"
              vector-effect="non-scaling-stroke" />
      </g>
    </svg>
  `;
  if (head) head.insertBefore(folds, head.firstChild);

  const closeBtn = panel.el.querySelector('.pp-close');
  if (closeBtn) {
    closeBtn.setAttribute('aria-label', 'Schließen');
    closeBtn.innerHTML = '<span class="pp-close-label">SCHLIESSEN</span>';
    if (head) head.insertBefore(closeBtn, folds.nextSibling);
  }

  // Auto-collapse when user scrolls back to top and tries to go further up
  const scrollEl = panel.el.querySelector('.pp-scroll');
  let lastScrollTop = 0;
  // Schwelle von 2 auf 12 px gelockert: nach Traegheits-Scrollen kam
  // scrollTop selten exakt auf <= 2, dadurch griff das Wegwischen kaum.
  scrollEl.addEventListener('wheel', (e) => {
    if (scrollEl.scrollTop <= 12 && e.deltaY < -8) {
      panel.close();
    }
  }, { passive: true });
  // Touch overscroll: close when at top and dragging further down
  let touchStartY = 0;
  scrollEl.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  scrollEl.addEventListener('touchmove', (e) => {
    const dy = e.touches[0].clientY - touchStartY;
    if (scrollEl.scrollTop <= 12 && dy > 60) panel.close();
  }, { passive: true });

  const tweenCameraTo = (worldPos, opts = {}) => {
    const dur = REDUCED_MOTION ? 0.001 : (opts.duration ?? 1.1);
    const dir = new THREE.Vector3().subVectors(camera.position, orbit.target).normalize();
    if (dir.lengthSq() < 1e-7) dir.set(0.1, 0.2, 1).normalize();
    const dist = Math.max(orbit.minDistance + 1.2, 2.8);
    const next = worldPos.clone().add(dir.multiplyScalar(dist));

    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(orbit.target);
    gsap.to(camera.position, {
      x: next.x, y: next.y, z: next.z,
      duration: dur, ease: 'power3.inOut',
      onUpdate: invalidate,
    });
    gsap.to(orbit.target, {
      x: worldPos.x, y: worldPos.y, z: worldPos.z,
      duration: dur, ease: 'power3.inOut',
      onUpdate: invalidate,
      // Am Ziel gilt die neue Blickrichtung als Anker fuer den begrenzten
      // Spielraum — sonst zaehlt weiter der Winkel vom vorherigen Ort.
      onComplete: captureLookAnchor,
    });
  };

  const tweenCameraHome = () => {
    const dur = REDUCED_MOTION ? 0.001 : 1.2;
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(orbit.target);
    gsap.to(camera.position, {
      x: cameraHome.position.x, y: cameraHome.position.y, z: cameraHome.position.z,
      duration: dur, ease: 'power3.inOut', onUpdate: invalidate,
    });
    gsap.to(orbit.target, {
      x: cameraHome.target.x, y: cameraHome.target.y, z: cameraHome.target.z,
      duration: dur, ease: 'power3.inOut', onUpdate: invalidate,
      onComplete: captureLookAnchor,
    });
  };

  let activeIndex = -1;

  // Editor-Vorschau (?edit=1): Titel, Untertitel und Text im echten Panel
  // direkt editierbar machen; jede Änderung geht per postMessage an den
  // Editor (gleiche Origin), der sie nach Firestore schreibt.
  const makePanelEditable = (sp) => {
    const post = (field, value) => {
      try {
        window.parent.postMessage({ type: 'paas-edit', id: sp.id, field, value }, location.origin);
      } catch (err) {
        console.warn('postMessage fehlgeschlagen:', err);
      }
    };
    panel.el.classList.add('pp-editing');

    // Titel: echte Schreibweise editieren, Anzeige bleibt versal.
    panel.$title.textContent = sp.name;
    panel.$title.style.textTransform = 'uppercase';
    panel.$title.setAttribute('contenteditable', 'plaintext-only');
    panel.$title.onblur = () => {
      const v = panel.$title.textContent.trim();
      if (v && v !== sp.name) { sp.name = v; post('title', v); }
    };

    const subtitleEl = panel.$meta.querySelectorAll('li')[1]?.querySelector('span:last-child');
    if (subtitleEl) {
      subtitleEl.setAttribute('contenteditable', 'plaintext-only');
      subtitleEl.onblur = () => {
        const v = subtitleEl.textContent.trim();
        if (v !== sp.subtitle) { sp.subtitle = v; post('subtitle', v); }
      };
    }

    panel.$body.setAttribute('contenteditable', 'true');
    panel.$body.onblur = () => {
      const paragraphs = [...panel.$body.querySelectorAll('p')]
        .map((p) => p.innerHTML.trim())
        .filter(Boolean);
      const v = paragraphs.length ? paragraphs.join('\n\n') : panel.$body.textContent.trim();
      if (v !== sp.body) { sp.body = v; post('body', v); }
    };
  };

  const openStandpoint = (sp) => {
    const idx = standpoints.indexOf(sp);
    if (idx >= 0) activeIndex = idx;
    syncTimeline();
    // Bilder auflösen (statische URLs sofort, hochgeladene aus Firestore) —
    // einmal pro Standpunkt, danach gecacht.
    sp.imagesReady = sp.imagesReady || resolveImages(sp, import.meta.env.BASE_URL);
    const data = {
      caption: `STANDPUNKT · ${sp.display}`,
      title: sp.name.toUpperCase(),
      meta: [
        { label: 'KAPITEL', value: sp.display },
        { label: 'CHARAKTER', value: sp.subtitle },
        { label: 'ORT', value: 'PAASLEBEN · GARTEN' },
      ],
      body: sp.body,
      images: [],
    };
    // 1) fly camera, 2) when tween is decelerating, slide panel up
    const dur = REDUCED_MOTION ? 0.001 : 1.2;
    tweenCameraTo(sp.world, { duration: dur });
    // open panel just as the tween enters its slow-down phase (~70% in)
    const delay = REDUCED_MOTION ? 0 : Math.max(0, dur * 700 - 50);
    // Das Öffnen ist um ~0,8 s verzögert. Wer in diesem Fenster schließt
    // (oder ein anderes Schild antippt), darf nicht danach wieder vom
    // wartenden Timer überrascht werden — deshalb merkbar und abbrechbar.
    clearTimeout(pendingOpenTimer);
    pendingOpenCancelled = false;
    pendingOpenTimer = setTimeout(() => {
      sp.imagesReady.then((images) => {
        if (pendingOpenCancelled) return;
        panel.open({ ...data, images });
        if (EDIT_MODE) makePanelEditable(sp);
      });
    }, delay);
  };

  // panel.close stays as-is — camera remains at the standpoint after closing

  const openByIndex = (idx) => {
    if (interactionLocked) return;
    if (idx < 0 || idx >= standpoints.length) return;
    openStandpoint(standpoints[idx]);
  };

  // ── Zeitleiste ─────────────────────────────────────────────────────
  // Auf Touch-Geräten der eigentliche Weg zwischen den Orten: die Kamera lässt
  // sich dort absichtlich kaum frei bewegen, und die Ortsschilder sind
  // ausgeblendet, weil sie sich gegenseitig überdeckten.
  const tlTrack = document.querySelector('#tl-track');

  const buildTimeline = () => {
    if (!tlTrack) return;
    tlTrack.textContent = '';
    standpoints.forEach((sp, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tl-item';
      b.dataset.idx = String(idx);
      b.setAttribute('aria-label', `${sp.display} ${sp.name} — ansehen`);
      b.innerHTML = `<span class="tl-num">${sp.display}</span><span class="tl-name"></span>`;
      // Namen als Text setzen, nicht als HTML — er kommt aus Firestore.
      b.querySelector('.tl-name').textContent = sp.name;
      b.addEventListener('click', () => openByIndex(idx));
      tlTrack.appendChild(b);
    });
  };

  // Hebt den aktiven Eintrag hervor und schiebt ihn in den sichtbaren Bereich.
  const syncTimeline = () => {
    if (!tlTrack) return;
    const items = tlTrack.children;
    for (let i = 0; i < items.length; i++) {
      const on = i === activeIndex;
      items[i].classList.toggle('is-active', on);
      if (on) {
        // Nur horizontal scrollen — scrollIntoView würde auch die Seite
        // vertikal verschieben.
        const el = items[i];
        const ziel = el.offsetLeft - (tlTrack.clientWidth - el.offsetWidth) / 2;
        tlTrack.scrollTo({ left: Math.max(0, ziel), behavior: 'smooth' });
      }
    }
  };

  // Wird weiter unten im Audio-Block mit der echten Umsetzung belegt. Die
  // Draufsicht braucht den Ton, steht aber vor dem Audio-Block.
  let startAudio = () => {};

  // ── Draufsicht ─────────────────────────────────────────────────────
  // Senkrecht über das Areal, mit Wolken- und Nebelschicht darüber und Ton.
  // Die Kamera wird dabei wie beim Einflug direkt gefahren: orbit.update()
  // würde die Neigung sofort auf minPolarAngle (50°) zurückziehen, senkrecht
  // nach unten ist damit über die Steuerung nicht erreichbar.
  const sky = createSky(document.querySelector('#stage'));
  const topDownBtn = document.querySelector('#topdown-button');
  let topDown = false;
  let poseBeforeTopDown = null;

  // Höhe so wählen, dass das ganze Areal ins Bild passt — quer und längs,
  // abgeleitet aus den tatsächlichen Standpunkten statt fest verdrahtet.
  const topDownPose = () => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sumY = 0;
    for (const sp of standpoints) {
      minX = Math.min(minX, sp.world.x); maxX = Math.max(maxX, sp.world.x);
      minZ = Math.min(minZ, sp.world.z); maxZ = Math.max(maxZ, sp.world.z);
      sumY += sp.world.y;
    }
    if (!standpoints.length) {
      return { target: cameraHome.target.clone(), height: 9 };
    }
    const target = new THREE.Vector3(
      (minX + maxX) / 2, sumY / standpoints.length, (minZ + maxZ) / 2,
    );
    const halbV = THREE.MathUtils.degToRad(camera.fov / 2);
    const halbH = Math.atan(Math.tan(halbV) * camera.aspect);
    const nötigQuer = ((maxX - minX) / 2) / Math.tan(halbH);
    const nötigLängs = ((maxZ - minZ) / 2) / Math.tan(halbV);
    // Etwas Luft ringsum, und in vernünftigen Grenzen halten.
    return { target, height: clamp(Math.max(nötigQuer, nötigLängs) * 1.35, 6, 18) };
  };

  const driveCameraTo = (pos, target, dauer) => new Promise((done) => {
    const vonPos = camera.position.clone();
    const vonZiel = orbit.target.clone();
    const t = { v: 0 };
    const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
    let fertig = false;
    let notaus;
    const abschluss = (tw) => {
      if (fertig) return;
      fertig = true;
      clearTimeout(notaus);
      tw?.kill();
      camera.position.copy(pos);
      orbit.target.copy(target);
      camera.lookAt(target);
      invalidate();
      done();
    };
    const tw = gsap.to(t, {
      v: 1,
      duration: REDUCED_MOTION ? 0.001 : dauer,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.position.copy(tmpP.lerpVectors(vonPos, pos, t.v));
        orbit.target.copy(tmpT.lerpVectors(vonZiel, target, t.v));
        camera.lookAt(orbit.target);
        invalidate();
      },
      onComplete: () => abschluss(tw),
    });
    // Gleiche Reissleine wie beim Einflug: ohne laufendes requestAnimationFrame
    // käme onComplete nie und die Ansicht bliebe für immer gesperrt.
    notaus = setTimeout(() => abschluss(tw), (REDUCED_MOTION ? 0 : dauer * 1000) + 1500);
  });

  const setTopDown = async (an) => {
    if (an === topDown) return;
    topDown = an;
    topDownBtn?.setAttribute('aria-pressed', String(an));
    document.body.classList.toggle('is-topdown', an);

    if (an) {
      poseBeforeTopDown = {
        position: camera.position.clone(),
        target: orbit.target.clone(),
      };
      const { target, height } = topDownPose();
      // Winziger Versatz in Z: genau senkrecht ist die Blickrichtung parallel
      // zum Up-Vektor, dann ist die Ausrichtung nicht definiert und das Bild
      // kann umklappen.
      const pos = new THREE.Vector3(target.x, target.y + height, target.z + 0.001);
      orbit.enabled = false;
      introFlying = true;          // hält orbit.update() aus der Schleife
      sky.show();
      panel.close();
      startAudio(true);            // in dieser Ansicht spielt der Ton
      await driveCameraTo(pos, target, 1.8);
    } else {
      sky.hide();
      const zurück = poseBeforeTopDown;
      if (zurück) await driveCameraTo(zurück.position, zurück.target, 1.5);
      introFlying = false;
      orbit.enabled = true;
      orbit.update();
      captureLookAnchor();
      invalidate();
    }
  };

  topDownBtn?.addEventListener('click', () => setTopDown(!topDown));

  // ── Tippen auf den oberen Rand schließt ──
  // Vorher nur in der Glasphase (--reveal < 0.5) aktiv — sobald man etwas
  // mehr als eine halbe Bildschirmhöhe gescrollt hatte, war die Zone tot
  // und es gab kaum noch einen Weg zurück. Jetzt immer.
  const closeZone = document.createElement('div');
  closeZone.className = 'pp-close-zone';
  closeZone.setAttribute('aria-label', 'Schließen — auf den oberen Bereich tippen');
  panel.el.appendChild(closeZone);
  closeZone.addEventListener('click', () => panel.close());

  // ── Global Hotkeys ──
  let numKeyBuffer = '';
  let numKeyTimer = 0;
  let helpVisible = false;
  let helpMode = 'modal'; // 'modal' (sticky, e.g. Info button) | 'hint' (closes on mousemove)
  const dbg = document.querySelector('#debug-panel');
  const toggleHelp = (force, mode = 'modal') => {
    helpVisible = force ?? !helpVisible;
    if (helpVisible) helpMode = mode;
    document.body.classList.toggle('show-help', helpVisible);
  };
  const toggleDebug = (force) => {
    if (!dbg) return;
    dbg.hidden = force === undefined ? !dbg.hidden : !force;
    debugMovementUnlocked = !dbg.hidden;
  };

  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      toggleDebug();
      return;
    }

    // Ignore when typing in inputs
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Zifferntasten → Standpunkt nach Schild-Nr. öffnen. Zwei Ziffern kurz
    // hintereinander (z. B. „1" dann „3") öffnen zweistellige Nummern.
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      clearTimeout(numKeyTimer);
      numKeyBuffer += e.key;
      const tryOpen = (want) => {
        const idx = standpoints.findIndex((s) => s.display === want);
        if (idx >= 0) openByIndex(idx);
      };
      if (numKeyBuffer.length >= 2) {
        tryOpen(numKeyBuffer.slice(-2));
        numKeyBuffer = '';
      } else {
        numKeyTimer = setTimeout(() => {
          tryOpen(numKeyBuffer.padStart(2, '0'));
          numKeyBuffer = '';
        }, 350);
      }
      return;
    }

    // Arrow keys: cycle prev/next standpoint when one is active
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && standpoints.length) {
      e.preventDefault();
      if (activeIndex < 0) activeIndex = 0;
      else activeIndex = (activeIndex + (e.key === 'ArrowRight' ? 1 : standpoints.length - 1)) % standpoints.length;
      openByIndex(activeIndex);
      return;
    }

    // H → home (close panel + return camera)
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      panel.close();
      tweenCameraHome();
      activeIndex = -1;
      return;
    }

    // ? or / → toggle help overlay (transient hint mode)
    if (e.key === '?' || (e.key === '/' && !e.shiftKey)) {
      e.preventDefault();
      toggleHelp(!helpVisible, 'hint');
      return;
    }
  });

  // Only the transient hint mode closes on mouse move.
  document.addEventListener('mousemove', () => {
    if (helpVisible && helpMode === 'hint') toggleHelp(false);
  });

  // ── Info button ──
  const infoBtn = document.querySelector('#info-button');
  if (infoBtn) {
    infoBtn.addEventListener('click', () => toggleHelp(true, 'modal'));
  }
  const helpOverlay = document.querySelector('#help-overlay');
  if (helpOverlay) {
    // Click outside card or on close button → dismiss
    helpOverlay.addEventListener('click', (e) => {
      if (e.target === helpOverlay) toggleHelp(false);
    });
    const helpClose = helpOverlay.querySelector('.help-close');
    if (helpClose) helpClose.addEventListener('click', () => toggleHelp(false));
  }

  // ── Audio: autoplay muted + mute/unmute toggle ──
  const audio = document.querySelector('#bgm');
  const audioBtn = document.querySelector('#audio-button');
  if (audio && audioBtn) {
    // Try to start playback (muted) ASAP — browsers allow this.
    audio.volume = 0.55;
    const tryPlay = () => {
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    tryPlay();
    // Safari requires a user gesture even for muted autoplay.
    // Retry on the first pointerdown / touchstart / keydown / click anywhere.
    const gestureUnlock = () => {
      tryPlay();
      ['pointerdown','touchstart','keydown','click'].forEach(t =>
        window.removeEventListener(t, gestureUnlock, true));
    };
    ['pointerdown','touchstart','keydown','click'].forEach(t =>
      window.addEventListener(t, gestureUnlock, { capture: true, once: false }));

    const setMuted = (muted) => {
      audio.muted = muted;
      audioBtn.setAttribute('aria-pressed', String(!muted));
      audioBtn.setAttribute('aria-label', muted ? 'Ton einschalten' : 'Ton ausschalten');
      audioBtn.classList.toggle('is-on', !muted);
      const lbl = audioBtn.querySelector('.ui-chip-label');
      if (lbl) lbl.textContent = muted ? 'Ton' : 'Ton an';
      if (!muted) tryPlay();
    };
    setMuted(true);
    audioBtn.addEventListener('click', () => setMuted(!audio.muted));
    // Von der Draufsicht aus: dort spielt der Ton automatisch. Der Klick auf
    // den Knopf ist die Nutzergeste, die Browser fuer Ton mit Lautstaerke
    // verlangen — deshalb funktioniert das Aufheben der Stummschaltung hier.
    startAudio = (unmute) => { if (unmute) setMuted(false); else tryPlay(); };
  }

  let splatAlignmentReady = false;
  let refreshDebugSplatBase = () => {};

  // ── Debug Panel: manual splat & camera control ──
  if (dbg) {
    const splatState = {
      px: REFERENCE_SPLAT.positionOffset.x,
      py: REFERENCE_SPLAT.positionOffset.y,
      pz: REFERENCE_SPLAT.positionOffset.z,
      rx: REFERENCE_SPLAT.rotationOffset.x,
      ry: REFERENCE_SPLAT.rotationOffset.y,
      rz: REFERENCE_SPLAT.rotationOffset.z,
      s: REFERENCE_SPLAT.scale,
    };
    const splatBaseQuat = new THREE.Quaternion();
    const splatBaseScale = new THREE.Vector3(1, 1, 1);
    const splatBasePos = new THREE.Vector3();
    const splatBase = {
      position: splatBasePos,
      quaternion: splatBaseQuat,
      scale: splatBaseScale,
    };

    // Top-view state: store previous perspective camera config
    let isTopView = false;
    let prevCamConfig = null;

    const toggleTopView = () => {
      if (!isTopView) {
        // Enter top-view: save current perspective state and switch to orthographic
        prevCamConfig = {
          isPerspective: true,
          position: camera.position.clone(),
          target: orbit.target.clone(),
        };
        isTopView = true;

        // Switch to orthographic camera looking straight down at splat
        const ortho = new THREE.OrthographicCamera(
          -8, 8,  // left, right
          -8, 8,  // top, bottom
          0.1, 100 // near, far
        );
        const center = orbit.target.clone();
        ortho.position.set(center.x, center.y + 12, center.z);
        ortho.lookAt(center);
        ortho.updateProjectionMatrix();

        // Replace camera in viewer and orbit
        orbit.object = ortho;
        viewer.camera = ortho;
        renderer.render(viewer.scene, ortho);
        invalidate();
      } else {
        // Exit top-view: restore perspective camera
        if (prevCamConfig) {
          camera.position.copy(prevCamConfig.position);
          orbit.target.copy(prevCamConfig.target);
          orbit.object = camera;
          viewer.camera = camera;
          orbit.update();
          invalidate();
        }
        isTopView = false;
      }
    };

    // Capture base (post-GLB) splat transform once available.
    const captureBase = () => {
      if (!splatAlignmentReady || !viewer.splatMesh) return false;
      splatBaseQuat.copy(viewer.splatMesh.quaternion);
      splatBaseScale.copy(viewer.splatMesh.scale);
      splatBasePos.copy(viewer.splatMesh.position);
      return true;
    };
    refreshDebugSplatBase = captureBase;
    // Wait until splat mesh exists before initializing.
    const waitBase = () => { if (!captureBase()) setTimeout(waitBase, 250); };
    waitBase();

    const applySplat = () => {
      if (!viewer.splatMesh) return;
      applySplatOffset(viewer.splatMesh, splatBase, {
        positionOffset: { x: splatState.px, y: splatState.py, z: splatState.pz },
        rotationOffset: { x: splatState.rx, y: splatState.ry, z: splatState.rz },
        scale: splatState.s,
      });
      invalidate();
    };
    // Spherical camera control (around current orbit.target)
    const camState = {
      targetX: orbit.target.x,
      targetY: orbit.target.y,
      targetZ: orbit.target.z,
      yaw: 62.2,
      pitch: 29.9,
      dist: 2.8,
    };
    const applyCam = () => {
      orbit.target.set(camState.targetX, camState.targetY, camState.targetZ);
      const yaw = THREE.MathUtils.degToRad(camState.yaw);
      const pitch = THREE.MathUtils.degToRad(camState.pitch);
      const r = camState.dist;
      const x = orbit.target.x + r * Math.sin(yaw) * Math.cos(pitch);
      const y = orbit.target.y + r * Math.sin(pitch);
      const z = orbit.target.z + r * Math.cos(yaw) * Math.cos(pitch);
      camera.position.set(x, y, z);
      orbit.update();
      invalidate();
    };

    const setOut = (key, val) => {
      const o = dbg.querySelector(`output[data-out="${key}"]`);
      if (o) o.textContent = (typeof val === 'number' && !Number.isInteger(val)) ? val.toFixed(2) : String(val);
    };

    // Live mirror: read camera back into the debug panel whenever it moves
    // (skip while the user is actively dragging a slider).
    let userDraggingSlider = false;
    dbg.addEventListener('pointerdown', (e) => {
      if (e.target instanceof HTMLInputElement) userDraggingSlider = true;
    });
    window.addEventListener('pointerup', () => { userDraggingSlider = false; });

    let mirrorAccum = 0;
    const mirrorTick = (dt) => {
      if (userDraggingSlider || isTopView) return; // Skip when in top-view mode
      mirrorAccum += dt;
      if (mirrorAccum < 80) return; // ~12Hz refresh is enough
      mirrorAccum = 0;
      const p = camera.position, tg = orbit.target;
      const dx = p.x - tg.x, dy = p.y - tg.y, dz = p.z - tg.z;
      const dist = Math.hypot(dx, dy, dz);
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
      const pitch = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dy / Math.max(dist, 1e-6)))));
      camState.targetX = tg.x; camState.targetY = tg.y; camState.targetZ = tg.z;
      camState.yaw = yaw; camState.pitch = pitch; camState.dist = dist;
      const targetXIn = dbg.querySelector('input[data-ctl="cam-target-x"]');
      const targetYIn = dbg.querySelector('input[data-ctl="cam-target-y"]');
      const targetZIn = dbg.querySelector('input[data-ctl="cam-target-z"]');
      const yawIn = dbg.querySelector('input[data-ctl="cam-yaw"]');
      const pitchIn = dbg.querySelector('input[data-ctl="cam-pitch"]');
      const distIn = dbg.querySelector('input[data-ctl="cam-dist"]');
      if (targetXIn) targetXIn.value = String(tg.x.toFixed(2));
      if (targetYIn) targetYIn.value = String(tg.y.toFixed(2));
      if (targetZIn) targetZIn.value = String(tg.z.toFixed(2));
      if (yawIn) yawIn.value = String(Math.round(yaw));
      if (pitchIn) pitchIn.value = String(Math.round(Math.max(20, Math.min(89, pitch))));
      if (distIn) distIn.value = String(dist.toFixed(1));
      setOut('cam-target-x', tg.x.toFixed(2));
      setOut('cam-target-y', tg.y.toFixed(2));
      setOut('cam-target-z', tg.z.toFixed(2));
      setOut('cam-yaw', Math.round(yaw));
      setOut('cam-pitch', Math.round(pitch));
      setOut('cam-dist', dist.toFixed(1));
    };
    // Hook into rAF
    let _mirrorLast = performance.now();
    const mirrorLoop = () => {
      const now = performance.now();
      mirrorTick(now - _mirrorLast);
      _mirrorLast = now;
      requestAnimationFrame(mirrorLoop);
    };
    requestAnimationFrame(mirrorLoop);

    dbg.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      const key = t.dataset.ctl;
      const v = parseFloat(t.value);
      if (key === 'splat-px') { splatState.px = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-py') { splatState.py = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-pz') { splatState.pz = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-rx') { splatState.rx = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-ry') { splatState.ry = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-rz') { splatState.rz = v; setOut(key, v); applySplat(); }
      else if (key === 'splat-s') { splatState.s = v; setOut(key, v); applySplat(); }
      else if (key === 'cam-target-x') { camState.targetX = v; setOut(key, v); applyCam(); }
      else if (key === 'cam-target-y') { camState.targetY = v; setOut(key, v); applyCam(); }
      else if (key === 'cam-target-z') { camState.targetZ = v; setOut(key, v); applyCam(); }
      else if (key === 'cam-yaw') { camState.yaw = v; setOut(key, v); applyCam(); }
      else if (key === 'cam-pitch') { camState.pitch = v; setOut(key, v); applyCam(); }
      else if (key === 'cam-dist') { camState.dist = v; setOut(key, v); applyCam(); }
    });

    const flash = (btn, msg = 'Kopiert ✓') => {
      const original = btn.textContent;
      btn.textContent = msg;
      btn.classList.add('flashed');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('flashed'); }, 1100);
    };
    const copyText = async (text, btn) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(btn);
      } catch {
        // Fallback: select via temp textarea
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); flash(btn); } catch { flash(btn, 'Fehler'); }
        ta.remove();
      }
    };

    const fmt = (n, d = 2) => Number(n).toFixed(d).replace(/\.?0+$/, '');
    const cameraSnapshot = () => {
      const p = camera.position, tg = orbit.target;
      const dx = p.x - tg.x, dy = p.y - tg.y, dz = p.z - tg.z;
      const dist = Math.hypot(dx, dy, dz);
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
      const pitch = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, dy / Math.max(dist, 1e-6)))));
      return { p, tg, yaw, pitch, dist };
    };
    const debugSnapshotText = () => {
      const { p, tg, yaw, pitch, dist } = cameraSnapshot();
      return `Splat:\n` +
        `  positionOffset: { x: ${fmt(splatState.px, 3)}, y: ${fmt(splatState.py, 3)}, z: ${fmt(splatState.pz, 3)} }\n` +
        `  rotationOffset: { x: ${fmt(splatState.rx, 1)}, y: ${fmt(splatState.ry, 1)}, z: ${fmt(splatState.rz, 1)} }\n` +
        `  scale: ${fmt(splatState.s, 3)}\n` +
        `Kamera:\n` +
        `  position: { x: ${fmt(p.x, 3)}, y: ${fmt(p.y, 3)}, z: ${fmt(p.z, 3)} }\n` +
        `  target:   { x: ${fmt(tg.x, 3)}, y: ${fmt(tg.y, 3)}, z: ${fmt(tg.z, 3)} }\n` +
        `  yaw=${fmt(yaw, 1)} pitch=${fmt(pitch, 1)} dist=${fmt(dist, 2)}`;
    };

    dbg.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement)) return;
      const act = t.dataset.act;
      if (act === 'splat-reset') {
        Object.assign(splatState, {
          px: REFERENCE_SPLAT.positionOffset.x,
          py: REFERENCE_SPLAT.positionOffset.y,
          pz: REFERENCE_SPLAT.positionOffset.z,
          rx: REFERENCE_SPLAT.rotationOffset.x,
          ry: REFERENCE_SPLAT.rotationOffset.y,
          rz: REFERENCE_SPLAT.rotationOffset.z,
          s: REFERENCE_SPLAT.scale,
        });
        ['splat-px','splat-py','splat-pz','splat-rx','splat-ry','splat-rz','splat-s'].forEach(k => {
          const inp = dbg.querySelector(`input[data-ctl="${k}"]`);
          const values = {
            'splat-px': splatState.px,
            'splat-py': splatState.py,
            'splat-pz': splatState.pz,
            'splat-rx': splatState.rx,
            'splat-ry': splatState.ry,
            'splat-rz': splatState.rz,
            'splat-s': splatState.s,
          };
          const v = values[k];
          if (inp) inp.value = String(v);
          setOut(k, v);
        });
        applySplat();
      } else if (act === 'splat-print') {
        copyText(debugSnapshotText().split('Kamera:')[0].trim(), t);
      } else if (act === 'cam-topview') {
        toggleTopView();
        t.textContent = isTopView ? 'Perspektive' : 'Top-View';
        t.classList.toggle('active', isTopView);
      } else if (act === 'cam-save') {
        cameraHome.position.copy(camera.position);
        cameraHome.target.copy(orbit.target);
        flash(t, 'Gespeichert ✓');
      } else if (act === 'cam-print' || act === 'cam-copy') {
        // Read live values straight from the camera (= wherever the user has moved it).
        const { p, tg, yaw, pitch, dist } = cameraSnapshot();
        const text = `Kamera (aktueller Stand):\n` +
          `  position: { x: ${fmt(p.x,3)}, y: ${fmt(p.y,3)}, z: ${fmt(p.z,3)} }\n` +
          `  target:   { x: ${fmt(tg.x,3)}, y: ${fmt(tg.y,3)}, z: ${fmt(tg.z,3)} }\n` +
          `  yaw=${fmt(yaw,1)}° pitch=${fmt(pitch,1)}° dist=${fmt(dist,2)}`;
        copyText(text, t);
        // Sync the sliders / outputs to the live values so they don't snap.
        camState.yaw = yaw; camState.pitch = pitch; camState.dist = dist;
        const yawIn = dbg.querySelector('input[data-ctl="cam-yaw"]');
        const pitchIn = dbg.querySelector('input[data-ctl="cam-pitch"]');
        const distIn = dbg.querySelector('input[data-ctl="cam-dist"]');
        const targetXIn = dbg.querySelector('input[data-ctl="cam-target-x"]');
        const targetYIn = dbg.querySelector('input[data-ctl="cam-target-y"]');
        const targetZIn = dbg.querySelector('input[data-ctl="cam-target-z"]');
        if (targetXIn) targetXIn.value = String(fmt(tg.x, 2));
        if (targetYIn) targetYIn.value = String(fmt(tg.y, 2));
        if (targetZIn) targetZIn.value = String(fmt(tg.z, 2));
        if (yawIn) yawIn.value = String(Math.round(yaw));
        if (pitchIn) pitchIn.value = String(Math.round(Math.max(20, Math.min(89, pitch))));
        if (distIn) distIn.value = String(fmt(dist, 1));
        setOut('cam-target-x', fmt(tg.x, 2));
        setOut('cam-target-y', fmt(tg.y, 2));
        setOut('cam-target-z', fmt(tg.z, 2));
        setOut('cam-yaw', Math.round(yaw));
        setOut('cam-pitch', Math.round(pitch));
        setOut('cam-dist', fmt(dist, 1));
      } else if (act === 'copy-all') {
        copyText(debugSnapshotText(), t);
      }
    });
  }

  // ── Cursor (desktop only) ──────────────
  const cursor = new PaasCursor({
    magneticTargets: () => document.querySelectorAll('[data-marker]'),
    magneticRadius: 70,
  });
  cursor.mount();

  // ── Asset load ─────────────────────────
  const startLoadAssets = async () => {
    // hand-tracked items — splat + glb under sprechende Namen
    manager.itemStart('Szene · Splat');
    manager.itemStart('Standpunkte · Modell');

    let splatLoaded = false;
    let gltfLoaded = false;
    const tryProgress = () => {
      const total = 2;
      const done = (splatLoaded ? 1 : 0) + (gltfLoaded ? 1 : 0);
      loader.setProgress(done / total, splatLoaded && !gltfLoaded ? 'Standpunkte · Modell' : 'Szene · Splat');
    };

    let gltf = null;
    let splatAlignment = buildSplatAlignment(null);
    // Orte parallel zum GLB laden — Firestore, sonst Snapshot-Fallback.
    const locationsPromise = fetchLocations();

    try {
      const gltfLoader = new GLTFLoader(manager);
      gltf = await new Promise((res, rej) => gltfLoader.load(MODEL_PATH, res, undefined, rej));
      splatAlignment = buildSplatAlignment(gltf.scene);

      // GLB bleibt unsichtbar — dient nur noch als Transform-Quelle für den Splat.
      if (viewer.scene) viewer.scene.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((n) => {
        n.visible = false;
      });
    } catch (err) {
      console.error('GLB-Ladefehler:', err);
    }

    try {
      const locations = await locationsPromise;
      for (const loc of locations) {
        if (!loc.visible) continue;
        const sp = {
          id: loc.id,
          display: loc.displayNumber || '—',
          name: loc.title,
          subtitle: loc.subtitle,
          body: loc.body,
          images: loc.images,
          world: new THREE.Vector3(loc.position.x, loc.position.y, loc.position.z),
        };
        standpoints.push(sp);
        markers.push({
          data: sp, el: buildMarkerEl(sp),
          alpha: 0, lastX: -1e4, lastY: -1e4, lastA: -1, pe: false,
        });
      }
      updateMovementBounds();
      buildTimeline();
    } catch (err) {
      console.error('Orte-Ladefehler:', err);
    }

    gltfLoaded = true;
    manager.itemEnd('Standpunkte · Modell');
    tryProgress();
    invalidate();

    try {
      await viewer.addSplatScene(SCENE_SPLAT_PATH, {
        showLoadingUI: false,
        progressiveLoad: true,
        splatAlphaRemovalThreshold: 0,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      });
      if (viewer.splatMesh) {
        viewer.splatMesh.setSplatScale(STYLE.splatScale);
        applyAlignmentToSplat(viewer.splatMesh, splatAlignment);
      }

      if (splatAlignment.hasAuthoredTransform) {
        camera.position.applyMatrix4(splatAlignment.matrix);
        orbit.target.applyMatrix4(splatAlignment.matrix);
        orbit.update();
      }

      homeBase.position.copy(camera.position);
      homeBase.target.copy(orbit.target);
      viewFitReady = true;
      // Rahmung an das aktuelle Seitenverhältnis anpassen und die Kamera
      // direkt dorthin setzen — im Hochformat ist das der eigentliche Fix.
      applyViewFit();
      camera.position.copy(cameraHome.position);
      orbit.target.copy(cameraHome.target);
      orbit.update();
      lastCamPos.copy(camera.position);
      lastTarget.copy(orbit.target);
      lastQuat.copy(camera.quaternion);
      splatAlignmentReady = true;
      refreshDebugSplatBase();
      if (viewer.splatMesh) {
        applySplatOffset(viewer.splatMesh, {
          position: viewer.splatMesh.position.clone(),
          quaternion: viewer.splatMesh.quaternion.clone(),
          scale: viewer.splatMesh.scale.clone(),
        });
      }
      splatLoaded = true;
      manager.itemEnd('Szene · Splat');
      tryProgress();
      invalidate();
    } catch (err) {
      console.error('Splat-Ladefehler:', err);
      splatLoaded = true;
      manager.itemEnd('Szene · Splat');
      tryProgress();
    }
  };

  // ── Bootstrap ──────────────────────────
  // Bei Deep-Link/Editor-Vorschau das Intro sofort überspringen.
  if (DEEP_LINK_ORT || EDIT_MODE) setTimeout(() => loader._finish(true), 60);
  await Promise.all([startLoadAssets(), loader.start()]);

  // Einflug vor der Freigabe: währenddessen soll niemand die Kamera greifen.
  // Bei Deep-Link oder Editor-Vorschau entfällt er — dort will man sofort am
  // Ziel sein, nicht erst eine Anflugschleife sehen.
  if (!DEEP_LINK_ORT && !EDIT_MODE) await playIntroFlight();
  interactionLocked = false;

  if (DEEP_LINK_ORT) {
    const want = DEEP_LINK_ORT.padStart(2, '0');
    const sp = standpoints.find((s) => s.display === want);
    if (sp) openStandpoint(sp);
  }

  // ── Render Loop ────────────────────────
  let last = performance.now();
  let acc = 0, frames = 0;
  const minPR = 0.7;
  const maxPR = pixelRatio;

  const animate = () => {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = now - last;
    last = now;
    acc += dt;
    frames += 1;

    if (acc >= 1000) {
      const fps = (frames * 1000) / acc;
      if (fps < 32 && pixelRatio > minPR + 0.05) {
        pixelRatio = clamp(pixelRatio - 0.1, minPR, maxPR);
        renderer.setPixelRatio(pixelRatio);
        resize();
      } else if (fps > 55 && pixelRatio < maxPR - 0.05) {
        pixelRatio = clamp(pixelRatio + 0.05, minPR, maxPR);
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
      acc = 0; frames = 0;
    }

    // Waehrend des Einflugs faehrt playIntroFlight() die Kamera selbst;
    // orbit.update() wuerde sie in die Grenzen zurueckziehen.
    if (!introFlying) orbit.update();

    if (renderInvalidated || hasViewChanged() || isDragging) {
      renderInvalidated = false;
      try {
        viewer.update();
        viewer.render();
      } catch (e) {
        // viewer not ready yet — try next frame
      }
    }

    // Marker NACH orbit.update() und dem Render projizieren: erst dann ist
    // camera.matrixWorldInverse für dieses Frame aktuell. Vorher lief das
    // in einem eigenen rAF, der vor dem Render-Loop registriert war — die
    // Schilder rechneten deshalb mit der Kameramatrix des Vorframes und
    // liefen beim Drehen um so weiter nach, je schneller gedreht wurde.
    updateMarkers();
  };
  animate();

  // Nur im Dev-Server: Handle zum Nachmessen (Drift, Marker-Positionen).
  // Wird beim Produktions-Build wegoptimiert.
  if (import.meta.env.DEV) {
    window.__paas = {
      camera, orbit, markers, renderer, THREE, updateMarkers,
      cameraHome, playIntroFlight,
      captureLookAnchor, applyLimitedLook, buildTimeline, syncTimeline,
    };
  }
};

// graceful boot
boot().catch((err) => {
  console.error('Boot-Fehler:', err);
});
