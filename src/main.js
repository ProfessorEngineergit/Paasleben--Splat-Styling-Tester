import './style.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

import { PaasLoader } from './lib/paas-loader.js';
import { PaasCursor } from './lib/paas-cursor.js';
import { PaasPanel } from './lib/paas-panel.js';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.splat`;
const MODEL_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;

const STYLE = {
  bg: '#f4ecd8',
  splatScale: 1.32,
  splatRotation: -28,
};

const REFERENCE_CAMERA = {
  position: { x: -4.6, y: 1.79, z: 4.02 },
  target: { x: -2.85, y: 0.26, z: 2.8 },
};

const MOVE_BOUNDS = {
  minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5,
};

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE_POINTER = matchMedia('(pointer: coarse)').matches;

const STANDPUNKT_SUBLINES = [
  'Ankommen, orientieren, Blickachsen lesen.',
  'Materialität, Licht und Bewegung in Balance.',
  'Raumkanten, Übergänge und Aufenthaltsqualität.',
  'Rhythmus aus Wegeführung, Dichte und Öffnung.',
  'Fokuspunkt mit klarer Lesbarkeit der Szene.',
];

const STORY_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus efficitur, turpis vitae fringilla volutpat, lectus massa posuere mi, id facilisis purus sem et ante.',
  'Praesent at nulla ac lacus dictum tempor. Integer pharetra varius mi, sed cursus arcu efficitur eget. Quisque ultricies libero nec justo pretium, sit amet ullamcorper arcu eleifend.',
  'Suspendisse potenti. Morbi quis turpis eget lorem pulvinar tincidunt. Nunc cursus ligula eget arcu aliquet, sed efficitur leo dignissim. Cras id lorem viverra, feugiat elit non.',
  'Donec in justo sem. Integer porta, magna non tristique fermentum, purus tortor facilisis tortor, non gravida urna eros in urna.',
];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const buildBody = (idx) => {
  const a = STORY_PARAGRAPHS[idx % STORY_PARAGRAPHS.length];
  const b = STORY_PARAGRAPHS[(idx + 1) % STORY_PARAGRAPHS.length];
  const c = STORY_PARAGRAPHS[(idx + 2) % STORY_PARAGRAPHS.length];
  return `${a}\n\n${b}\n\n${c}`;
};

const cleanName = (raw) => {
  let name = (raw || 'Standpunkt').replace(/[\s_.]*\d+$/, '').trim();
  if (!name) name = 'Standpunkt';
  if (name.toLowerCase().includes('eingang')) name = 'Willkommen';
  return name;
};

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
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    invalidate();
  };
  new ResizeObserver(resize).observe(viewport);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  resize();

  // ── Pan-only drag (no rotate, like before) ─────
  const previousPointer = new THREE.Vector2();
  let isDragging = false;
  let interactionLocked = true; // unlocked when loader done
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const applyPan = (dx, dy) => {
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) return;
    forward.normalize();
    right.copy(up).cross(forward).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(right, dx * 0.01);
    move.addScaledVector(forward, dy * 0.012);

    const prev = orbit.target.clone();
    orbit.target.add(move);
    orbit.target.set(
      clamp(orbit.target.x, MOVE_BOUNDS.minX, MOVE_BOUNDS.maxX),
      orbit.target.y,
      clamp(orbit.target.z, MOVE_BOUNDS.minZ, MOVE_BOUNDS.maxZ),
    );
    camera.position.add(orbit.target.clone().sub(prev));
    invalidate();
  };

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (interactionLocked) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    previousPointer.set(e.clientX, e.clientY);
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch {}
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!isDragging || interactionLocked) return;
    const dx = e.clientX - previousPointer.x;
    const dy = e.clientY - previousPointer.y;
    previousPointer.set(e.clientX, e.clientY);
    applyPan(dx, dy);
  });
  const stop = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
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
    btn.setAttribute('aria-label', `${sp.marker} — ${sp.name} — öffnen`);
    btn.innerHTML = `
      <span class="sm-card">
        <span class="sm-num">Nr. ${sp.marker}</span>
        <span class="sm-title">${sp.name}</span>
      </span>
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

  const updateMarkers = () => {
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    for (const m of markers) {
      projTmp.copy(m.data.world).project(camera);
      const visible = projTmp.z < 1 && projTmp.z > -1;
      const x = (projTmp.x * 0.5 + 0.5) * w;
      const y = (-projTmp.y * 0.5 + 0.5) * h;
      m.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      m.el.style.opacity = visible ? '1' : '0';
      m.el.style.pointerEvents = visible ? 'auto' : 'none';
    }
  };

  // marker / cursor update loop independent from render
  let markerRaf = 0;
  const tickMarkers = () => {
    updateMarkers();
    markerRaf = requestAnimationFrame(tickMarkers);
  };

  // ── Panel + camera tween ───────────────
  const panel = new PaasPanel({ sceneVeil });

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
  scrollEl.addEventListener('wheel', (e) => {
    if (scrollEl.scrollTop <= 2 && e.deltaY < -8) {
      panel.close();
    }
  }, { passive: true });
  // Touch overscroll: close when at top and dragging further down
  let touchStartY = 0;
  scrollEl.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  scrollEl.addEventListener('touchmove', (e) => {
    const dy = e.touches[0].clientY - touchStartY;
    if (scrollEl.scrollTop <= 2 && dy > 60) panel.close();
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
    });
  };

  let activeIndex = -1;

  const openStandpoint = (sp) => {
    const idx = standpoints.indexOf(sp);
    if (idx >= 0) activeIndex = idx;
    const data = {
      caption: `STANDPUNKT · ${sp.marker}`,
      title: sp.name.toUpperCase(),
      meta: [
        { label: 'KAPITEL', value: sp.marker },
        { label: 'CHARAKTER', value: sp.subtitle },
        { label: 'ORT', value: 'PAASLEBEN · GARTEN' },
      ],
      body: sp.body,
      image: null,
    };
    // 1) fly camera, 2) when tween is decelerating, slide panel up
    const dur = REDUCED_MOTION ? 0.001 : 1.2;
    tweenCameraTo(sp.world, { duration: dur });
    // open panel just as the tween enters its slow-down phase (~70% in)
    const delay = REDUCED_MOTION ? 0 : Math.max(0, dur * 700 - 50);
    setTimeout(() => panel.open(data), delay);
  };

  // panel.close stays as-is — camera remains at the standpoint after closing

  const openByIndex = (idx) => {
    if (interactionLocked) return;
    if (idx < 0 || idx >= standpoints.length) return;
    openStandpoint(standpoints[idx]);
  };

  // ── Click-to-close on transparent top zone of glass ──
  // While the panel is open and still in glass-phase (reveal < ~0.5),
  // clicking the still-clear upper area (outside the title block) closes it.
  const closeZone = document.createElement('div');
  closeZone.className = 'pp-close-zone';
  closeZone.setAttribute('aria-label', 'Schließen — auf den durchsichtigen Bereich tippen');
  panel.el.appendChild(closeZone);
  closeZone.addEventListener('click', () => {
    const r = parseFloat(panel.el.style.getPropertyValue('--reveal') || '0');
    if (r < 0.5) panel.close();
  });

  // ── Global Hotkeys ──
  let helpVisible = false;
  const toggleHelp = (force) => {
    helpVisible = force ?? !helpVisible;
    document.body.classList.toggle('show-help', helpVisible);
  };

  window.addEventListener('keydown', (e) => {
    // Ignore when typing in inputs
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Number keys 1..9 → open standpoint by index
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < standpoints.length) {
        e.preventDefault();
        openByIndex(idx);
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

    // ? or / → toggle help overlay
    if (e.key === '?' || (e.key === '/' && !e.shiftKey)) {
      e.preventDefault();
      toggleHelp();
      return;
    }
  });

  // Quietly hide help if mouse moves
  document.addEventListener('mousemove', () => {
    if (helpVisible) toggleHelp(false);
  }, { once: false });

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

    try {
      await viewer.addSplatScene(SCENE_SPLAT_PATH, {
        showLoadingUI: false,
        progressiveLoad: true,
        splatAlphaRemovalThreshold: 0,
        position: [0, 0, 0],
        rotation: [
          Math.sin(THREE.MathUtils.degToRad(STYLE.splatRotation) / 2),
          0,
          Math.cos(THREE.MathUtils.degToRad(STYLE.splatRotation) / 2),
          0,
        ],
        scale: [1.2, 1.2, 1.2],
      });
      if (viewer.splatMesh) {
        viewer.splatMesh.setSplatScale(STYLE.splatScale);
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

    try {
      const gltfLoader = new GLTFLoader(manager);
      const gltf = await new Promise((res, rej) => gltfLoader.load(MODEL_PATH, res, undefined, rej));
      gltf.scene.rotation.y = -Math.PI / 2;
      if (viewer.scene) viewer.scene.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);

      let i = 0;
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.visible = false;
        const pos = new THREE.Vector3();
        node.getWorldPosition(pos);
        const idx = standpoints.length;
        const sp = {
          id: `sp-${idx + 1}`,
          marker: String(idx + 1).padStart(2, '0'),
          name: cleanName(node.name),
          subtitle: STANDPUNKT_SUBLINES[idx % STANDPUNKT_SUBLINES.length],
          body: buildBody(idx),
          world: pos.clone(),
        };
        standpoints.push(sp);
        const el = buildMarkerEl(sp);
        markers.push({ data: sp, el });
        i++;
      });

      gltfLoaded = true;
      manager.itemEnd('Standpunkte · Modell');
      tryProgress();
      invalidate();
    } catch (err) {
      console.error('GLB-Ladefehler:', err);
      gltfLoaded = true;
      manager.itemEnd('Standpunkte · Modell');
      tryProgress();
    }
  };

  // ── Bootstrap ──────────────────────────
  await Promise.all([startLoadAssets(), loader.start()]);
  interactionLocked = false;
  tickMarkers();

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

    orbit.update();

    if (renderInvalidated || hasViewChanged() || isDragging) {
      renderInvalidated = false;
      try {
        viewer.update();
        viewer.render();
      } catch (e) {
        // viewer not ready yet — try next frame
      }
    }
  };
  animate();
};

// graceful boot
boot().catch((err) => {
  console.error('Boot-Fehler:', err);
});
