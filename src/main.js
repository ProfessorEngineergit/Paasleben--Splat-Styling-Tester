import './style.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.splat`;
const MODEL_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;

const MOVE_BOUNDS = {
  minX: -3.5,
  maxX: 3.5,
  minZ: -3.5,
  maxZ: 3.5,
};

const STYLE_STATE = {
  backgroundColor: '#EBDBBC',
  contrast: 1.04,
  saturation: 1.04,
  splatScale: 1.32,
  splatRotation: -28,
};

const REFERENCE_CAMERA = {
  position: { x: -4.6, y: 1.79, z: 4.02 },
  target: { x: -2.85, y: 0.26, z: 2.8 },
};

const ONBOARDING_STORAGE_KEY = 'paasleben_onboarding_v4';

const STANDPOINT_SUBLINES = [
  'Ankommen, orientieren und Blickachsen lesen.',
  'Materialität, Licht und Bewegung in Balance.',
  'Raumkanten, Übergänge und Aufenthaltsqualität.',
  'Rhythmus aus Wegeführung, Dichte und Öffnung.',
  'Fokuspunkt mit klarer Lesbarkeit der Szene.',
];

const STORY_TEMPLATES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus efficitur, turpis vitae fringilla volutpat, lectus massa posuere mi, id facilisis purus sem et ante. Curabitur a libero ac lorem tempus condimentum.',
  'Praesent at nulla ac lacus dictum tempor. Integer pharetra varius mi, sed cursus arcu efficitur eget. Quisque ultricies libero nec justo pretium, sit amet ullamcorper arcu eleifend. In hac habitasse platea dictumst.',
  'Suspendisse potenti. Morbi quis turpis eget lorem pulvinar tincidunt. Nunc cursus ligula eget arcu aliquet, sed efficitur leo dignissim. Cras id lorem viverra, feugiat elit non, luctus metus.',
  'Ut placerat orci id sem luctus, ac interdum turpis blandit. Sed a elit ut arcu varius lobortis non et risus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.',
  'Donec in justo sem. Integer porta, magna non tristique fermentum, purus tortor facilisis tortor, non gravida urna eros in urna. Maecenas at dui id purus vulputate convallis vitae nec nibh.',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatValue = (value, decimals = 2) => {
  const normalized = Math.abs(value) < 1e-6 ? 0 : value;
  return normalized.toFixed(decimals);
};

const buildStory = (name, index) => {
  const chapters = [
    {
      title: 'Ankunft',
      text: `${name} als erster Lesepunkt. ${STORY_TEMPLATES[index % STORY_TEMPLATES.length]}`,
    },
    {
      title: 'Raumcharakter',
      text: `${STORY_TEMPLATES[(index + 1) % STORY_TEMPLATES.length]} ${STORY_TEMPLATES[(index + 2) % STORY_TEMPLATES.length]}`,
    },
    {
      title: 'Material & Kanten',
      text: `${STORY_TEMPLATES[(index + 3) % STORY_TEMPLATES.length]} ${STORY_TEMPLATES[(index + 4) % STORY_TEMPLATES.length]}`,
    },
    {
      title: 'Nutzungsszenario',
      text: `${STORY_TEMPLATES[(index + 2) % STORY_TEMPLATES.length]} ${STORY_TEMPLATES[(index + 1) % STORY_TEMPLATES.length]}`,
    },
  ];

  return chapters;
};

const boot = async () => {
  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <div id="layout">
      <aside id="standpoints-panel" class="glass-panel">
        <p class="panel-kicker">Splat Styling Tester</p>
        <h1>Paasleben Explorer</h1>
        <p class="panel-intro">
          Standpunkte wählen, Story scrollen und die Kameradaten in Echtzeit nachvollziehen.
        </p>
        <div id="standpoint-list" class="standpoint-list"></div>
      </aside>

      <div id="viewport-wrapper">
        <div id="viewport"></div>
        <div id="labels-container"></div>
      </div>

      <div id="quick-hud">
        <div id="perf-chip" class="hud-chip">FPS -- · DPR --</div>
        <button id="toggle-debug" class="hud-chip" type="button">Debug</button>
      </div>
    </div>
  `;

  const viewport = root.querySelector('#viewport');
  const labelsContainer = root.querySelector('#labels-container');
  const standpointList = root.querySelector('#standpoint-list');
  const perfChip = root.querySelector('#perf-chip');
  const toggleDebugButton = root.querySelector('#toggle-debug');

  if (!(viewport instanceof HTMLElement) || !(labelsContainer instanceof HTMLElement)) return;

  const detailOverlay = document.querySelector('#detail-overlay');
  const overlayKicker = document.querySelector('#overlay-kicker');
  const overlayTitle = document.querySelector('#overlay-title');
  const overlaySubtitle = document.querySelector('#overlay-subtitle');
  const overlayBody = document.querySelector('#overlay-body');
  const overlayMarkers = document.querySelector('#overlay-markers');
  const overlayClose = document.querySelector('#overlay-close');
  const overlayProgressFill = document.querySelector('#overlay-progress-fill');

  if (
    !(detailOverlay instanceof HTMLElement)
    || !(overlayKicker instanceof HTMLElement)
    || !(overlayTitle instanceof HTMLElement)
    || !(overlaySubtitle instanceof HTMLElement)
    || !(overlayBody instanceof HTMLElement)
    || !(overlayMarkers instanceof HTMLElement)
    || !(overlayClose instanceof HTMLButtonElement)
    || !(overlayProgressFill instanceof HTMLElement)
  ) {
    return;
  }

  const onboardingOverlay = document.querySelector('#onboarding-overlay');
  const onboardingStart = document.querySelector('#onboarding-start');

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);

  let currentPixelRatio = Math.min(window.devicePixelRatio, 1.2);
  const minPixelRatio = 0.7;
  const maxPixelRatio = Math.min(window.devicePixelRatio, 1.45);
  renderer.setPixelRatio(currentPixelRatio);

  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
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

  const orbitControls = new GaussianSplats3D.OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(
    REFERENCE_CAMERA.target.x,
    REFERENCE_CAMERA.target.y,
    REFERENCE_CAMERA.target.z,
  );
  orbitControls.enableDamping = true;
  orbitControls.enableZoom = false;
  orbitControls.enablePan = false;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 15;
  orbitControls.minPolarAngle = Math.PI * 0.3;
  orbitControls.maxPolarAngle = Math.PI * 0.7;
  orbitControls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  orbitControls.update();

  let initialCameraPos = camera.position.clone();
  let initialTargetPos = orbitControls.target.clone();

  const state = {
    splatX: 0,
    splatY: 0,
    splatZ: 0,
    splatRotY: STYLE_STATE.splatRotation,
  };

  let storyProgress = 0;
  let isSplatSceneLoaded = false;
  let isLeftDragging = false;
  let cameraTweening = false;
  let interactionLocked = false;
  let renderInvalidated = true;

  const labelsToUpdate = [];
  const standpoints = [];

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const previousPointer = new THREE.Vector2();
  const projectionTmp = new THREE.Vector3();

  const lastCameraPosition = camera.position.clone();
  const lastTargetPosition = orbitControls.target.clone();
  const lastCameraQuaternion = camera.quaternion.clone();

  let activeStandpoint = null;
  let activeSections = [];
  let storyActiveIndex = 0;
  let storyScrollRaf = 0;

  const debugPanel = document.createElement('div');
  debugPanel.id = 'debug-panel';
  debugPanel.classList.add('collapsed');
  document.body.appendChild(debugPanel);

  const debugStats = {
    camPos: document.createElement('span'),
    target: document.createElement('span'),
    splat: document.createElement('span'),
  };

  const invalidate = () => {
    renderInvalidated = true;
  };

  const hasViewChanged = () => {
    const cameraMoved = camera.position.distanceToSquared(lastCameraPosition) > 1e-7;
    const targetMoved = orbitControls.target.distanceToSquared(lastTargetPosition) > 1e-7;
    const rotationChanged = 1 - Math.abs(camera.quaternion.dot(lastCameraQuaternion)) > 1e-8;

    if (cameraMoved) lastCameraPosition.copy(camera.position);
    if (targetMoved) lastTargetPosition.copy(orbitControls.target);
    if (rotationChanged) lastCameraQuaternion.copy(camera.quaternion);

    return cameraMoved || targetMoved || rotationChanged;
  };

  const resize = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    invalidate();
  };

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(viewport);
  resize();

  const applySceneStyling = () => {
    viewport.style.backgroundColor = STYLE_STATE.backgroundColor;
    document.body.style.backgroundColor = STYLE_STATE.backgroundColor;
    renderer.setClearColor(STYLE_STATE.backgroundColor, 0);

    renderer.domElement.style.filter = [
      `contrast(${STYLE_STATE.contrast})`,
      `saturate(${STYLE_STATE.saturation})`,
    ].join(' ');
  };

  const applySplatTransform = () => {
    if (!viewer.splatMesh) return;

    viewer.splatMesh.position.set(state.splatX, state.splatY, state.splatZ);
    viewer.splatMesh.quaternion.setFromAxisAngle(up, THREE.MathUtils.degToRad(state.splatRotY));
    viewer.splatMesh.setSplatScale(STYLE_STATE.splatScale + storyProgress * 0.1);
    invalidate();
  };

  const formatSliderValue = (key, value) => {
    if (key === 'splatRotY') return `${Math.round(value)}`;
    return formatValue(value, 1).replace(/\.0$/, '');
  };

  const setSliderProgress = (input) => {
    const min = Number.parseFloat(input.min);
    const max = Number.parseFloat(input.max);
    const current = Number.parseFloat(input.value);
    const progress = ((current - min) / (max - min)) * 100;
    input.style.setProperty('--progress', `${clamp(progress, 0, 100)}%`);
  };

  const buildDebugPanel = () => {
    const createStatRow = (labelText, valueNode) => {
      const row = document.createElement('div');
      row.className = 'debug-stat-row';

      const label = document.createElement('span');
      label.className = 'debug-stat-label';
      label.textContent = `${labelText}:`;

      valueNode.className = 'debug-stat-value';
      row.append(label, valueNode);
      return row;
    };

    const createSlider = (labelText, min, max, step, key) => {
      const row = document.createElement('div');
      row.className = 'debug-row';

      const label = document.createElement('label');
      label.className = 'debug-label';
      label.textContent = labelText;

      const input = document.createElement('input');
      input.className = 'debug-slider';
      input.type = 'range';
      input.min = `${min}`;
      input.max = `${max}`;
      input.step = `${step}`;
      input.value = `${state[key]}`;
      setSliderProgress(input);

      const value = document.createElement('span');
      value.className = 'val';
      value.textContent = formatSliderValue(key, state[key]);

      input.addEventListener('input', (event) => {
        if (!(event.currentTarget instanceof HTMLInputElement)) return;

        state[key] = Number.parseFloat(event.currentTarget.value);
        value.textContent = formatSliderValue(key, state[key]);
        setSliderProgress(event.currentTarget);
        applySplatTransform();
      });

      row.append(label, input, value);
      return row;
    };

    const headingA = document.createElement('h3');
    headingA.className = 'debug-heading';
    headingA.textContent = 'Splat Adjustments';

    const headingB = document.createElement('h3');
    headingB.className = 'debug-heading debug-heading-camera';
    headingB.textContent = 'Camera Stats';

    const statsWrap = document.createElement('div');
    statsWrap.className = 'debug-stats';
    statsWrap.append(
      createStatRow('Cam Pos', debugStats.camPos),
      createStatRow('Target', debugStats.target),
      createStatRow('Splat', debugStats.splat),
    );

    debugPanel.append(
      headingA,
      createSlider('Splat X', -10, 10, 0.1, 'splatX'),
      createSlider('Splat Y', -10, 10, 0.1, 'splatY'),
      createSlider('Splat Z', -10, 10, 0.1, 'splatZ'),
      createSlider('Splat Rot Y', -180, 180, 1, 'splatRotY'),
      headingB,
      statsWrap,
    );
  };

  const updateDebugStats = () => {
    debugStats.camPos.textContent = `${formatValue(camera.position.x)}, ${formatValue(camera.position.y)}, ${formatValue(camera.position.z)}`;
    debugStats.target.textContent = `${formatValue(orbitControls.target.x)}, ${formatValue(orbitControls.target.y)}, ${formatValue(orbitControls.target.z)}`;
    debugStats.splat.textContent = `POS(${formatValue(state.splatX, 1)}, ${formatValue(state.splatY, 1)}, ${formatValue(state.splatZ, 1)}) ROT: ${Math.round(state.splatRotY)}`;
  };

  const renderOverlayMarkers = (count, activeIndex) => {
    overlayMarkers.innerHTML = '';

    for (let index = 0; index < count; index += 1) {
      const marker = document.createElement('span');
      marker.className = 'overlay-marker';
      marker.textContent = `${index + 1}`;
      if (index === activeIndex) marker.classList.add('active');
      overlayMarkers.appendChild(marker);
    }
  };

  const updateStoryEffects = () => {
    if (activeSections.length === 0) return;

    const maxScroll = Math.max(overlayBody.scrollHeight - overlayBody.clientHeight, 1);
    storyProgress = clamp(overlayBody.scrollTop / maxScroll, 0, 1);
    detailOverlay.style.setProperty('--story-progress', `${storyProgress}`);
    overlayProgressFill.style.transform = `scaleX(${storyProgress})`;

    const viewportFocusY = overlayBody.scrollTop + overlayBody.clientHeight * 0.42;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    activeSections.forEach((section, index) => {
      const sectionCenter = section.offsetTop + section.offsetHeight * 0.5;
      const distance = Math.abs(viewportFocusY - sectionCenter);
      const focus = clamp(1 - distance / (overlayBody.clientHeight * 0.85), 0, 1);
      section.style.opacity = `${0.48 + focus * 0.52}`;
      section.style.transform = `translateY(${(1 - focus) * 14}px) scale(${0.98 + focus * 0.02})`;
      section.style.filter = `blur(${(1 - focus) * 0.6}px)`;

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== storyActiveIndex) {
      storyActiveIndex = closestIndex;
      renderOverlayMarkers(activeSections.length, storyActiveIndex);
    }

    applySplatTransform();
  };

  const scheduleStoryEffects = () => {
    if (storyScrollRaf !== 0) return;

    storyScrollRaf = requestAnimationFrame(() => {
      storyScrollRaf = 0;
      updateStoryEffects();
    });
  };

  const renderStory = (standpoint) => {
    overlayKicker.textContent = `Standpunkt ${standpoint.marker}`;
    overlayTitle.textContent = standpoint.name;
    overlaySubtitle.textContent = standpoint.subtitle;

    overlayBody.innerHTML = standpoint.chapters
      .map((chapter) => `
        <section class="story-section">
          <h3>${chapter.title}</h3>
          <p>${chapter.text}</p>
        </section>
      `)
      .join('');

    activeSections = Array.from(overlayBody.querySelectorAll('.story-section'));
    storyActiveIndex = 0;
    overlayBody.scrollTop = 0;
    renderOverlayMarkers(activeSections.length, storyActiveIndex);
    updateStoryEffects();
  };

  const openStoryOverlay = (standpoint) => {
    activeStandpoint = standpoint;
    renderStory(standpoint);
    detailOverlay.classList.remove('hidden');
    overlayBody.focus({ preventScroll: true });
    invalidate();
  };

  const returnToInitialCamera = () => {
    gsap.killTweensOf(orbitControls.target);
    gsap.killTweensOf(camera.position);

    cameraTweening = true;
    gsap.to(orbitControls.target, {
      x: initialTargetPos.x,
      y: initialTargetPos.y,
      z: initialTargetPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: invalidate,
    });

    gsap.to(camera.position, {
      x: initialCameraPos.x,
      y: initialCameraPos.y,
      z: initialCameraPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        orbitControls.update();
        invalidate();
      },
      onComplete: () => {
        cameraTweening = false;
      },
    });
  };

  const closeStoryOverlay = () => {
    detailOverlay.classList.add('hidden');
    activeStandpoint = null;
    overlayBody.scrollTop = 0;
    storyProgress = 0;
    detailOverlay.style.setProperty('--story-progress', '0');
    overlayProgressFill.style.transform = 'scaleX(0)';
    applySplatTransform();

    labelsContainer.style.opacity = '1';
    labelsContainer.style.pointerEvents = 'none';

    returnToInitialCamera();
    invalidate();
  };

  const focusStandpoint = (standpoint, openOverlay = true) => {
    if (!standpoint) return;

    labelsContainer.style.opacity = '0';
    labelsContainer.style.pointerEvents = 'none';

    const targetPosition = standpoint.position;
    const direction = new THREE.Vector3().subVectors(camera.position, orbitControls.target).normalize();
    if (direction.lengthSq() < 1e-7) direction.set(0.1, 0.2, 1).normalize();

    const cameraDistance = Math.max(orbitControls.minDistance + 0.8, 2.6);
    const nextCameraPos = targetPosition.clone().add(direction.multiplyScalar(cameraDistance));

    gsap.killTweensOf(orbitControls.target);
    gsap.killTweensOf(camera.position);

    cameraTweening = true;
    gsap.to(orbitControls.target, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: 1.1,
      ease: 'power2.inOut',
      onUpdate: invalidate,
    });

    gsap.to(camera.position, {
      x: nextCameraPos.x,
      y: nextCameraPos.y,
      z: nextCameraPos.z,
      duration: 1.1,
      ease: 'power2.inOut',
      onUpdate: () => {
        orbitControls.update();
        invalidate();
      },
      onComplete: () => {
        cameraTweening = false;
        if (openOverlay) {
          openStoryOverlay(standpoint);
        }
      },
    });
  };

  const createStandpointButton = (standpoint) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'standpoint-item';
    button.innerHTML = `
      <span class="standpoint-marker">${standpoint.marker}</span>
      <span class="standpoint-copy">
        <strong>${standpoint.name}</strong>
        <small>${standpoint.subtitle}</small>
      </span>
    `;

    button.addEventListener('click', () => focusStandpoint(standpoint, true));

    return button;
  };

  const renderStandpointList = () => {
    if (!(standpointList instanceof HTMLElement)) return;

    standpointList.innerHTML = '';
    standpoints.forEach((standpoint) => {
      standpointList.appendChild(createStandpointButton(standpoint));
    });
  };

  const updateLabels = () => {
    if (labelsContainer.style.opacity === '0') return;

    const widthHalf = viewport.clientWidth / 2;
    const heightHalf = viewport.clientHeight / 2;

    for (const labelEntry of labelsToUpdate) {
      projectionTmp.copy(labelEntry.worldPosition).project(camera);

      if (projectionTmp.z > 1 || projectionTmp.z < -1) {
        labelEntry.element.style.display = 'none';
        continue;
      }

      labelEntry.element.style.display = 'flex';
      const x = projectionTmp.x * widthHalf + widthHalf;
      const y = -projectionTmp.y * heightHalf + heightHalf;
      labelEntry.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }
  };

  const applyRestrictedTranslation = (deltaX, deltaY) => {
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;

    if (forward.lengthSq() < 1e-8) return;
    forward.normalize();

    right.copy(up).cross(forward).normalize();

    const movement = new THREE.Vector3();
    movement.addScaledVector(right, deltaX * 0.01);
    movement.addScaledVector(forward, deltaY * 0.012);

    const previousTarget = orbitControls.target.clone();
    orbitControls.target.add(movement);
    orbitControls.target.set(
      clamp(orbitControls.target.x, MOVE_BOUNDS.minX, MOVE_BOUNDS.maxX),
      orbitControls.target.y,
      clamp(orbitControls.target.z, MOVE_BOUNDS.minZ, MOVE_BOUNDS.maxZ),
    );

    camera.position.add(orbitControls.target.clone().sub(previousTarget));
    invalidate();
  };

  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (interactionLocked) return;
    if (event.button !== 0) return;

    isLeftDragging = true;
    previousPointer.set(event.clientX, event.clientY);
    renderer.domElement.setPointerCapture(event.pointerId);
    invalidate();
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!isLeftDragging || interactionLocked) return;

    const deltaX = event.clientX - previousPointer.x;
    const deltaY = event.clientY - previousPointer.y;
    previousPointer.set(event.clientX, event.clientY);

    applyRestrictedTranslation(deltaX, deltaY);
  });

  const stopLeftDrag = (event) => {
    if (event.type !== 'pointercancel' && event.button !== 0) return;
    if (!isLeftDragging) return;

    isLeftDragging = false;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    invalidate();
  };

  renderer.domElement.addEventListener('pointerup', stopLeftDrag);
  renderer.domElement.addEventListener('pointercancel', stopLeftDrag);

  overlayClose.addEventListener('click', closeStoryOverlay);
  overlayBody.addEventListener('scroll', scheduleStoryEffects, { passive: true });

  detailOverlay.addEventListener('click', (event) => {
    if (event.target === detailOverlay) {
      closeStoryOverlay();
    }
  });

  toggleDebugButton?.addEventListener('click', () => {
    debugPanel.classList.toggle('collapsed');
  });

  const setInteractionLocked = (locked) => {
    interactionLocked = locked;
    renderer.domElement.style.pointerEvents = locked ? 'none' : 'auto';
  };

  const finishOnboarding = () => {
    if (onboardingOverlay instanceof HTMLElement) {
      onboardingOverlay.classList.add('hidden');
    }

    setInteractionLocked(false);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      // intentionally ignored
    }
    invalidate();
  };

  if (onboardingStart instanceof HTMLButtonElement) {
    onboardingStart.addEventListener('click', finishOnboarding);
  }

  let shouldShowOnboarding = true;
  try {
    shouldShowOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY) !== '1';
  } catch {
    shouldShowOnboarding = true;
  }

  if (!shouldShowOnboarding) {
    onboardingOverlay?.classList.add('hidden');
    setInteractionLocked(false);
  } else {
    setInteractionLocked(true);
  }

  buildDebugPanel();
  applySceneStyling();
  updateDebugStats();

  try {
    await viewer.addSplatScene(SCENE_SPLAT_PATH, {
      showLoadingUI: false,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
      position: [0, 0, 0],
      rotation: [Math.sin(THREE.MathUtils.degToRad(STYLE_STATE.splatRotation) / 2), 0, Math.cos(THREE.MathUtils.degToRad(STYLE_STATE.splatRotation) / 2), 0],
      scale: [1.2, 1.2, 1.2],
    });

    isSplatSceneLoaded = true;
    applySplatTransform();
    invalidate();

    const customLoader = document.querySelector('#loading-overlay');
    if (customLoader instanceof HTMLElement) {
      customLoader.classList.add('hidden');
    }

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(MODEL_PATH, (gltf) => {
      gltf.scene.rotation.y = -Math.PI / 2;

      if (viewer.scene) {
        viewer.scene.add(gltf.scene);
      }

      gltf.scene.updateMatrixWorld(true);

      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.visible = false;

        const position = new THREE.Vector3();
        node.getWorldPosition(position);

        let displayName = (node.name || 'Standpunkt').replace(/[\s_.]*\d+$/, '').trim();
        if (displayName.toLowerCase().includes('eingang')) {
          displayName = 'Willkommen';
        }

        const standpoint = {
          id: `standpoint-${standpoints.length + 1}`,
          marker: String(standpoints.length + 1).padStart(2, '0'),
          name: displayName,
          subtitle: STANDPOINT_SUBLINES[standpoints.length % STANDPOINT_SUBLINES.length],
          chapters: buildStory(displayName, standpoints.length),
          position: position.clone(),
        };

        standpoints.push(standpoint);

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'splat-label';
        label.innerHTML = `
          <span class="splat-label-marker">${standpoint.marker}</span>
          <span>${displayName}</span>
        `;

        label.addEventListener('mouseenter', () => {
          document.querySelector('#custom-cursor')?.classList.add('hovering');
        });
        label.addEventListener('mouseleave', () => {
          document.querySelector('#custom-cursor')?.classList.remove('hovering');
        });
        label.addEventListener('click', () => {
          if (interactionLocked) return;
          focusStandpoint(standpoint, true);
        });

        labelsContainer.appendChild(label);
        labelsToUpdate.push({
          element: label,
          worldPosition: position.clone(),
        });
      });

      renderStandpointList();
      invalidate();
    });
  } catch (error) {
    console.error(`Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
  }

  let lastFrameAt = performance.now();
  let perfAccumulatedMs = 0;
  let perfFrameCount = 0;
  let labelTick = 0;

  const animate = () => {
    requestAnimationFrame(animate);

    const now = performance.now();
    const deltaMs = now - lastFrameAt;
    lastFrameAt = now;

    perfAccumulatedMs += deltaMs;
    perfFrameCount += 1;

    if (perfAccumulatedMs >= 1000) {
      const fps = (perfFrameCount * 1000) / perfAccumulatedMs;

      if (fps < 30 && currentPixelRatio > minPixelRatio + 0.05) {
        currentPixelRatio = clamp(currentPixelRatio - 0.1, minPixelRatio, maxPixelRatio);
        renderer.setPixelRatio(currentPixelRatio);
        resize();
      } else if (fps > 53 && currentPixelRatio < maxPixelRatio - 0.05) {
        currentPixelRatio = clamp(currentPixelRatio + 0.05, minPixelRatio, maxPixelRatio);
        renderer.setPixelRatio(currentPixelRatio);
        resize();
      }

      if (perfChip instanceof HTMLElement) {
        perfChip.textContent = `FPS ${Math.round(fps)} · DPR ${currentPixelRatio.toFixed(2)}`;
      }

      perfAccumulatedMs = 0;
      perfFrameCount = 0;
    }

    orbitControls.update();

    const shouldRender = renderInvalidated || hasViewChanged() || cameraTweening || isLeftDragging || !isSplatSceneLoaded;
    if (!shouldRender) return;

    renderInvalidated = false;
    viewer.update();
    viewer.render();

    if (labelTick % 2 === 0) {
      updateLabels();
    }
    labelTick += 1;

    updateDebugStats();
  };

  animate();

  const cursor = document.querySelector('#custom-cursor');
  if (cursor instanceof HTMLElement) {
    window.addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });

    window.addEventListener('mousedown', (event) => {
      if (event.button === 0 || event.button === 2) {
        cursor.classList.add('rotating');
      }
    });

    window.addEventListener('mouseup', () => {
      cursor.classList.remove('rotating');
    });
  }
};

void boot();
