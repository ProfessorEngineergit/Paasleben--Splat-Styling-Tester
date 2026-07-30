// Karten-Editor: gleiche Splat-Szene wie der Viewer, aber mit freiem Orbit
// und editierbaren Orts-Markern. Alle Änderungen gehen live nach Firestore
// (`paas_locations`) und sind sofort auf der Website sichtbar.
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import {
  THEMES, applyTheme, cachedTheme, isTheme,
} from '../lib/paas-theme.js';
import { subscribeLocations } from '../lib/locations.js';
import {
  REFERENCE_CAMERA, buildSplatAlignment, applyAlignmentToSplat, applySplatOffset,
} from '../lib/splat-alignment.js';
import { setupImagesUI } from './images.js';
import { setupPreview } from './preview.js';

const SPLAT_PATH = `${import.meta.env.BASE_URL}scene.ksplat`;
const MODEL_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;
const LOCATIONS = 'paas_locations';

export const startEditor = () => {
  const viewport = document.querySelector('#editor-viewport');
  const markerLayer = document.querySelector('#editor-markers');
  const addButton = document.querySelector('#add-point-button');
  const addHint = document.querySelector('#add-hint');
  const syncStatus = document.querySelector('#sync-status');
  const saveStatus = document.querySelector('#save-status');
  const listEl = document.querySelector('#location-list');
  const form = document.querySelector('#location-form');
  const sidebarEmpty = document.querySelector('#sidebar-empty');
  const banner = document.querySelector('#editor-banner');
  // Vorschau ohne Login (?preview=1): Lesen ja, Schreiben nein.
  const READ_ONLY = document.body.dataset.readonly === '1';

  // ── Szene ──────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor('#f4ecd8', 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(REFERENCE_CAMERA.position.x, REFERENCE_CAMERA.position.y, REFERENCE_CAMERA.position.z);

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

  // Bewusst schnell und nahezu unbeschränkt — das ist ein Werkzeug,
  // keine Besucher-Tour.
  const orbit = new GaussianSplats3D.OrbitControls(camera, renderer.domElement);
  orbit.target.set(REFERENCE_CAMERA.target.x, REFERENCE_CAMERA.target.y, REFERENCE_CAMERA.target.z);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.12;
  orbit.rotateSpeed = 1.3;
  orbit.panSpeed = 1.4;
  orbit.zoomSpeed = 1.5;
  orbit.minDistance = 0.05;
  orbit.maxDistance = 120;
  orbit.maxPolarAngle = Math.PI * 0.999;
  orbit.update();

  const resize = () => {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  new ResizeObserver(resize).observe(viewport);
  resize();

  // ── Assets ─────────────────────────────────────────────────────────
  const loadAssets = async () => {
    let alignment = buildSplatAlignment(null);
    try {
      const gltf = await new Promise((res, rej) => new GLTFLoader().load(MODEL_PATH, res, undefined, rej));
      alignment = buildSplatAlignment(gltf.scene);
    } catch (err) {
      console.warn('GLB nicht ladbar — nutze Fallback-Ausrichtung:', err);
    }
    await viewer.addSplatScene(SPLAT_PATH, {
      showLoadingUI: false,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
    });
    if (viewer.splatMesh) {
      applyAlignmentToSplat(viewer.splatMesh, alignment);
      applySplatOffset(viewer.splatMesh, {
        position: viewer.splatMesh.position.clone(),
        quaternion: viewer.splatMesh.quaternion.clone(),
        scale: viewer.splatMesh.scale.clone(),
      });
    }
    if (alignment.hasAuthoredTransform) {
      camera.position.applyMatrix4(alignment.matrix);
      orbit.target.applyMatrix4(alignment.matrix);
      orbit.update();
    }
  };
  loadAssets().catch((err) => console.error('Szene-Ladefehler:', err));

  // ── Zustand ────────────────────────────────────────────────────────
  let locations = [];
  let selectedId = null;
  let dirtyWhileTyping = false; // Snapshot-Updates nicht in offene Eingaben schreiben

  const flashSave = (msg = 'Gespeichert ✓') => {
    saveStatus.textContent = msg;
    saveStatus.classList.add('is-visible');
    setTimeout(() => saveStatus.classList.remove('is-visible'), 1600);
  };

  // Positionen, die gerade gezogen werden oder auf die Server-Bestätigung
  // warten. Sie überleben zwischenzeitliche Firestore-Snapshots, damit ein
  // Marker während des Ziehens nicht auf den alten Stand zurückspringt.
  const pendingPositions = new Map();

  const showBanner = (text, kind = 'error') => {
    banner.textContent = text;
    banner.className = `editor-banner is-${kind}`;
    banner.hidden = false;
  };
  const hideBanner = () => { banner.hidden = true; };

  const describeSaveError = (err) => {
    if (err?.code === 'permission-denied' || /insufficient permissions/i.test(err?.message || '')) {
      return READ_ONLY
        ? 'Vorschau-Modus: Änderungen können nicht gespeichert werden. Melde dich unter /admin.html mit deinem Google-Konto an.'
        : 'Keine Schreibrechte — die Änderung wurde verworfen. Bist du mit dem freigeschalteten Google-Konto angemeldet? Freigeschaltet ist derzeit nur bahriannovotny@gmail.com.';
    }
    return `Speichern fehlgeschlagen: ${err?.code || err?.message || err}`;
  };

  const save = async (id, fields) => {
    try {
      await updateDoc(doc(db, LOCATIONS, id), { ...fields, updatedAt: new Date().toISOString() });
      flashSave();
      hideBanner();
    } catch (err) {
      console.error('Speichern fehlgeschlagen:', err);
      flashSave('Speichern fehlgeschlagen ✕');
      showBanner(describeSaveError(err));
    } finally {
      // Egal ob Erfolg oder Fehler: ab jetzt gilt wieder der Server-Stand.
      if (fields.position) pendingPositions.delete(id);
    }
  };

  // ── Overlay-Szene: Verschiebe-Gizmo (Pfeile wie in Shapr3D) ────────
  // Der Splat-Viewer rendert seine eigene Szene; das Gizmo lebt in einer
  // zweiten Szene, die danach ohne Clear darübergezeichnet wird.
  const overlayScene = new THREE.Scene();
  const gizmoProxy = new THREE.Object3D();
  overlayScene.add(gizmoProxy);

  const gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.setMode('translate');
  gizmo.setSize(0.85);
  // r167+: Helper-Objekt in die Szene hängen; ältere Versionen: Control selbst.
  overlayScene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);

  let gizmoDragging = false;
  gizmo.addEventListener('dragging-changed', (e) => {
    gizmoDragging = e.value;
    orbit.enabled = !e.value;
    if (!e.value && selectedId) {
      // Drag beendet → Position speichern
      const loc = locations.find((l) => l.id === selectedId);
      if (loc) save(selectedId, { position: loc.position });
    }
  });
  gizmo.addEventListener('objectChange', () => {
    if (!selectedId) return;
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) return;
    loc.position = { x: gizmoProxy.position.x, y: gizmoProxy.position.y, z: gizmoProxy.position.z };
    pendingPositions.set(loc.id, loc.position);
    fillPositionInputs(loc);
  });

  const syncGizmo = () => {
    const loc = locations.find((l) => l.id === selectedId);
    if (loc) {
      if (!gizmoDragging) gizmoProxy.position.set(loc.position.x, loc.position.y, loc.position.z);
      if (gizmo.object !== gizmoProxy) gizmo.attach(gizmoProxy);
      gizmo.enabled = true;
    } else {
      gizmo.detach();
      gizmo.enabled = false;
    }
  };

  // ── Flug-Steuerung: WASD/QE (+Shift = schnell) ─────────────────────
  const heldKeys = new Set();
  const isTyping = () => {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    heldKeys.add(e.code);
  });
  window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
  window.addEventListener('blur', () => heldKeys.clear());

  const flyTmp = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), move: new THREE.Vector3() };
  const applyFly = (dt) => {
    if (isTyping() || gizmoDragging) return;
    const k = heldKeys;
    let dx = 0, dz = 0, dy = 0;
    if (k.has('KeyW')) dz += 1;
    if (k.has('KeyS')) dz -= 1;
    if (k.has('KeyA')) dx -= 1;
    if (k.has('KeyD')) dx += 1;
    if (k.has('KeyQ')) dy -= 1;
    if (k.has('KeyE')) dy += 1;
    if (!dx && !dz && !dy) return;
    // Tempo skaliert mit dem Abstand zum Ziel — nah = fein, weit = schnell.
    const dist = camera.position.distanceTo(orbit.target);
    const speed = Math.max(0.4, dist) * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1.2) * dt;
    flyTmp.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    flyTmp.fwd.y = 0;
    if (flyTmp.fwd.lengthSq() < 1e-8) flyTmp.fwd.set(0, 0, -1);
    flyTmp.fwd.normalize();
    flyTmp.right.crossVectors(flyTmp.fwd, new THREE.Vector3(0, 1, 0)).normalize().negate();
    flyTmp.move.set(0, 0, 0)
      .addScaledVector(flyTmp.fwd, dz * speed)
      .addScaledVector(flyTmp.right, -dx * speed)
      .add(new THREE.Vector3(0, dy * speed, 0));
    camera.position.add(flyTmp.move);
    orbit.target.add(flyTmp.move);
  };

  // ── Pfeiltasten: ausgewählten Ort feinjustieren ────────────────────
  let nudgeSaveTimer = 0;
  window.addEventListener('keydown', (e) => {
    if (isTyping() || !selectedId) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.02;
    // Richtung an der Kamera ausrichten und auf die nächste Weltachse runden.
    flyTmp.fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    flyTmp.fwd.y = 0;
    flyTmp.fwd.normalize();
    const axis = Math.abs(flyTmp.fwd.x) > Math.abs(flyTmp.fwd.z)
      ? { fx: Math.sign(flyTmp.fwd.x), fz: 0, rx: 0, rz: Math.sign(flyTmp.fwd.x) }
      : { fx: 0, fz: Math.sign(flyTmp.fwd.z), rx: -Math.sign(flyTmp.fwd.z), rz: 0 };
    if (e.key === 'ArrowUp') { loc.position.x += axis.fx * step; loc.position.z += axis.fz * step; }
    if (e.key === 'ArrowDown') { loc.position.x -= axis.fx * step; loc.position.z -= axis.fz * step; }
    if (e.key === 'ArrowRight') { loc.position.x -= axis.rx * step; loc.position.z -= axis.rz * step; }
    if (e.key === 'ArrowLeft') { loc.position.x += axis.rx * step; loc.position.z += axis.rz * step; }
    fillPositionInputs(loc);
    clearTimeout(nudgeSaveTimer);
    nudgeSaveTimer = setTimeout(() => save(loc.id, { position: loc.position }), 450);
  });

  // ── Draufsicht ─────────────────────────────────────────────────────
  const topViewButton = document.querySelector('#top-view-button');
  let savedPose = null;
  topViewButton.addEventListener('click', () => {
    if (savedPose) {
      camera.position.copy(savedPose.position);
      orbit.target.copy(savedPose.target);
      savedPose = null;
      topViewButton.setAttribute('aria-pressed', 'false');
    } else {
      savedPose = { position: camera.position.clone(), target: orbit.target.clone() };
      const d = Math.max(4, camera.position.distanceTo(orbit.target));
      camera.position.set(orbit.target.x, orbit.target.y + d, orbit.target.z + 0.001);
      topViewButton.setAttribute('aria-pressed', 'true');
    }
    orbit.update();
  });

  // ── Marker-Overlay ─────────────────────────────────────────────────
  const markerEls = new Map(); // id → element
  const projTmp = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();

  const averageY = () => {
    const ys = locations.map((l) => l.position.y);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0.2;
  };

  const raycastToPlane = (event, planeY) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    dragPlane.constant = -planeY; // Ebene y = planeY
    return raycaster.ray.intersectPlane(dragPlane, hitPoint) ? hitPoint : null;
  };

  const buildMarker = (loc) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'edit-marker';
    el.innerHTML = '<span class="em-num"></span><span class="em-title"></span>';
    markerLayer.appendChild(el);

    // Ziehen verschiebt den Ort auf seiner Höhenebene; Klick wählt aus.
    let dragging = false;
    let moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragging = true;
      moved = false;
      orbit.enabled = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const current = locations.find((l) => l.id === loc.id);
      if (!current) return;
      const p = raycastToPlane(e, current.position.y);
      if (!p) return;
      moved = true;
      current.position = { x: p.x, y: current.position.y, z: p.z };
      pendingPositions.set(loc.id, current.position);
      if (selectedId === loc.id) fillPositionInputs(current);
    });
    el.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      orbit.enabled = true;
      el.releasePointerCapture(e.pointerId);
      const current = locations.find((l) => l.id === loc.id);
      if (moved && current) {
        save(loc.id, { position: current.position });
      }
      select(loc.id);
    });
    // Abgebrochener Drag (z. B. Fokusverlust): nicht in einem halben
    // Zustand hängen bleiben, sondern den Server-Stand wieder gelten lassen.
    el.addEventListener('pointercancel', () => {
      if (!dragging) return;
      dragging = false;
      orbit.enabled = true;
      pendingPositions.delete(loc.id);
    });
    return el;
  };

  const syncMarkers = () => {
    const seen = new Set();
    for (const loc of locations) {
      seen.add(loc.id);
      let el = markerEls.get(loc.id);
      if (!el) {
        el = buildMarker(loc);
        markerEls.set(loc.id, el);
      }
      el.querySelector('.em-num').textContent = loc.displayNumber || '·';
      el.querySelector('.em-title').textContent = loc.title || 'Ohne Titel';
      el.classList.toggle('is-hidden-location', !loc.visible);
      el.classList.toggle('is-selected', loc.id === selectedId);
    }
    for (const [id, el] of markerEls) {
      if (!seen.has(id)) {
        el.remove();
        markerEls.delete(id);
      }
    }
  };

  const updateMarkerPositions = () => {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    for (const loc of locations) {
      const el = markerEls.get(loc.id);
      if (!el) continue;
      projTmp.set(loc.position.x, loc.position.y, loc.position.z).project(camera);
      const visible = projTmp.z < 1 && projTmp.z > -1;
      el.style.transform = `translate(-50%, -100%) translate(${(projTmp.x * 0.5 + 0.5) * w}px, ${(-projTmp.y * 0.5 + 0.5) * h}px)`;
      el.style.opacity = visible ? '1' : '0';
      el.style.pointerEvents = visible ? 'auto' : 'none';
    }
  };

  // ── Sidebar: Liste + Formular ──────────────────────────────────────
  const fields = {
    title: document.querySelector('#f-title'),
    subtitle: document.querySelector('#f-subtitle'),
    body: document.querySelector('#f-body'),
    displayNumber: document.querySelector('#f-display'),
    order: document.querySelector('#f-order'),
    visible: document.querySelector('#f-visible'),
    px: document.querySelector('#f-px'),
    py: document.querySelector('#f-py'),
    pz: document.querySelector('#f-pz'),
  };
  const formTitle = document.querySelector('#form-title');

  const fillPositionInputs = (loc) => {
    if (document.activeElement === fields.px || document.activeElement === fields.py || document.activeElement === fields.pz) return;
    fields.px.value = loc.position.x.toFixed(3);
    fields.py.value = loc.position.y.toFixed(3);
    fields.pz.value = loc.position.z.toFixed(3);
  };

  const fillForm = (loc) => {
    formTitle.textContent = `${loc.displayNumber || '—'} · ${loc.title || 'Ohne Titel'}`;
    fields.title.value = loc.title;
    fields.subtitle.value = loc.subtitle;
    fields.body.value = loc.body;
    fields.displayNumber.value = loc.displayNumber;
    fields.order.value = loc.order;
    fields.visible.checked = loc.visible;
    fillPositionInputs(loc);
    imagesUI.setLocation(loc);
  };

  const select = (id) => {
    selectedId = id;
    const loc = locations.find((l) => l.id === id);
    form.hidden = !loc;
    sidebarEmpty.hidden = Boolean(loc);
    if (loc) fillForm(loc);
    syncMarkers();
    syncGizmo();
    renderList();
  };

  const listSearch = document.querySelector('#list-search');
  listSearch.addEventListener('input', () => renderList());

  const renderList = () => {
    const q = listSearch.value.trim().toLowerCase();
    listEl.innerHTML = '';
    for (const loc of locations) {
      if (q && !`${loc.displayNumber} ${loc.title}`.toLowerCase().includes(q)) continue;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'location-list-item';
      if (loc.id === selectedId) btn.classList.add('is-active');
      btn.textContent = `${loc.displayNumber || '—'} · ${loc.title || 'Ohne Titel'}${loc.visible ? '' : '  (ausgeblendet)'}`;
      btn.addEventListener('click', () => select(loc.id));
      li.appendChild(btn);
      listEl.appendChild(li);
    }
  };

  // Feld-Änderungen speichern (bei blur/change — kein Tipp-Spam nach Firestore).
  const bindField = (input, toFields) => {
    input.addEventListener('focus', () => { dirtyWhileTyping = true; });
    input.addEventListener('change', () => {
      dirtyWhileTyping = false;
      if (!selectedId) return;
      save(selectedId, toFields(input));
    });
    input.addEventListener('blur', () => { dirtyWhileTyping = false; });
  };
  bindField(fields.title, (i) => ({ title: i.value.trim() }));
  bindField(fields.subtitle, (i) => ({ subtitle: i.value.trim() }));
  bindField(fields.body, (i) => ({ body: i.value }));
  bindField(fields.displayNumber, (i) => ({ displayNumber: i.value.trim().padStart(2, '0') }));
  bindField(fields.order, (i) => ({ order: Number(i.value) || 0 }));
  fields.visible.addEventListener('change', () => {
    if (selectedId) save(selectedId, { visible: fields.visible.checked });
  });
  const savePosition = () => {
    if (!selectedId) return;
    save(selectedId, {
      position: {
        x: Number(fields.px.value) || 0,
        y: Number(fields.py.value) || 0,
        z: Number(fields.pz.value) || 0,
      },
    });
  };
  [fields.px, fields.py, fields.pz].forEach((i) => i.addEventListener('change', savePosition));

  document.querySelector('#close-form').addEventListener('click', () => select(null));

  // Ort duplizieren (praktisch für ähnliche Punkte, z. B. zweites Storchen-Nest)
  document.querySelector('#duplicate-location').addEventListener('click', async () => {
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) return;
    const display = nextDisplayNumber();
    const ref = await addDoc(collection(db, LOCATIONS), {
      title: `${loc.title} (Kopie)`,
      subtitle: loc.subtitle,
      body: loc.body,
      displayNumber: display,
      order: Number(display),
      visible: false,
      position: { x: loc.position.x + 0.15, y: loc.position.y, z: loc.position.z + 0.15 },
      // Nur statische Bibliotheks-Bilder mitkopieren — Uploads gehören
      // exklusiv ihrem Ort (werden bei dessen Löschung entfernt).
      images: loc.images.filter((img) => img.url),
      updatedAt: new Date().toISOString(),
    });
    select(ref.id);
  });

  // End-Ansicht: echte Website im iframe, Texte direkt editierbar
  document.querySelector('#preview-location').addEventListener('click', () => {
    const loc = locations.find((l) => l.id === selectedId);
    if (loc) previewUI.open(loc);
  });

  document.querySelector('#delete-location').addEventListener('click', async () => {
    const loc = locations.find((l) => l.id === selectedId);
    if (!loc) return;
    if (!window.confirm(`„${loc.title}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    await imagesUI.deleteUploadedImagesOf(loc);
    await deleteDoc(doc(db, LOCATIONS, loc.id));
    select(null);
  });

  // ── Neuer Ort (Add-Modus) ──────────────────────────────────────────
  let addMode = false;
  const setAddMode = (on) => {
    addMode = on;
    addButton.setAttribute('aria-pressed', String(on));
    addHint.hidden = !on;
    viewport.classList.toggle('is-add-mode', on);
  };
  addButton.addEventListener('click', () => setAddMode(!addMode));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setAddMode(false);
  });

  const nextDisplayNumber = () => {
    const used = new Set(locations.map((l) => l.displayNumber));
    for (let n = 1; n < 100; n++) {
      const s = String(n).padStart(2, '0');
      if (!used.has(s)) return s;
    }
    return '99';
  };

  // Klick (ohne Drag) im Add-Modus → Ort an der Klickstelle anlegen.
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', async (e) => {
    if (!addMode || !downAt) return;
    const dist = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (dist > 6) return; // war ein Orbit-Drag
    const p = raycastToPlane(e, averageY());
    if (!p) return;
    setAddMode(false);
    const display = nextDisplayNumber();
    const ref = await addDoc(collection(db, LOCATIONS), {
      title: 'Neuer Ort',
      subtitle: '',
      body: '',
      displayNumber: display,
      order: Number(display),
      visible: false,
      position: { x: p.x, y: p.y, z: p.z },
      images: [],
      updatedAt: new Date().toISOString(),
    });
    select(ref.id);
    fields.title.focus();
    fields.title.select();
  });

  // ── Bilder-UI ──────────────────────────────────────────────────────
  const imagesUI = setupImagesUI({
    onImagesChanged: (locId, images) => save(locId, { images }),
  });

  // ── End-Ansicht (editierbares iframe der echten Website) ───────────
  const previewUI = setupPreview({
    onEdit: (locId, fields) => save(locId, fields),
  });

  // ── Design-Umschalter ──────────────────────────────────────────────
  // Gilt seitenweit: der gewählte Wert landet in paas_config/site und die
  // Website liest ihn beim Laden — die Umstellung wirkt also sofort für alle
  // Besucher, ohne Deploy. Ändert ausschließlich Farben und Schriften.
  const setupThemePicker = async () => {
    const select = document.querySelector('#theme-select');
    if (!select) return;
    for (const t of THEMES) {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.label;
      option.title = t.hint;
      select.appendChild(option);
    }
    const ref = doc(db, 'paas_config', 'site');
    try {
      const snap = await getDoc(ref);
      const stored = snap.exists() ? snap.data()?.theme : null;
      select.value = isTheme(stored) ? stored : cachedTheme();
    } catch (err) {
      console.warn('Design-Einstellung konnte nicht geladen werden:', err);
      select.value = cachedTheme();
    }
    select.addEventListener('change', async () => {
      const next = select.value;
      // Im Editor sofort anwenden, damit die End-Ansicht das neue Design zeigt.
      applyTheme(next);
      previewUI?.reload?.();
      try {
        // merge, damit das Dokument beim ersten Mal auch angelegt wird.
        await setDoc(ref, { theme: next, updatedAt: new Date().toISOString() }, { merge: true });
        flashSave('Design gespeichert ✓');
        hideBanner();
      } catch (err) {
        console.error('Design speichern fehlgeschlagen:', err);
        flashSave('Speichern fehlgeschlagen ✕');
        showBanner(describeSaveError(err));
      }
    });
  };
  setupThemePicker();

  // ── Live-Daten ─────────────────────────────────────────────────────
  subscribeLocations(
    (next) => {
      // Gerade gezogene / noch nicht bestätigte Positionen behalten Vorrang,
      // sonst springt ein Marker mitten im Ziehen auf den Server-Stand zurück.
      locations = next.map((l) => (
        pendingPositions.has(l.id) ? { ...l, position: pendingPositions.get(l.id) } : l
      ));
      syncStatus.classList.add('is-online');
      syncMarkers();
      syncGizmo();
      renderList();
      const loc = locations.find((l) => l.id === selectedId);
      if (loc && !dirtyWhileTyping) fillForm(loc);
      if (selectedId && !loc) select(null); // anderswo gelöscht
    },
    () => syncStatus.classList.remove('is-online'),
  );

  // Dev-Inspektion (nur lokaler Dev-Server)
  if (import.meta.env.DEV) {
    window.__paasEditor = {
      camera, orbit, heldKeys,
      isTyping: () => isTyping(),
      applyFly,
      // Bildschirm- → Weltkoordinaten auf einer Höhenebene (zum Ausmessen)
      screenToWorld: (clientX, clientY, planeY = averageY()) => {
        const p = raycastToPlane({ clientX, clientY }, planeY);
        return p ? { x: p.x, y: planeY, z: p.z } : null;
      },
      probe: () => ({ gizmoDragging, held: [...heldKeys], typing: isTyping(), frames: window.__paasFrames }),
    };
  }

  // ── Render-Loop ────────────────────────────────────────────────────
  let lastT = performance.now();
  const animate = () => {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (import.meta.env.DEV) window.__paasFrames = (window.__paasFrames || 0) + 1;
    applyFly(dt);
    orbit.update();
    try {
      viewer.update();
      viewer.render();
    } catch { /* Szene noch nicht bereit */ }
    // Gizmo-Szene ohne Clear über den Splat zeichnen
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlayScene, camera);
    renderer.autoClear = true;
    updateMarkerPositions();
  };
  animate();
};
