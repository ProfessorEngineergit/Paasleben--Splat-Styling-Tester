import './style.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.splat`;
const MODEL_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;

const SCENE_STYLE = {
  paper: '#EBDBBC',
  ink: '#191919',
  coral: '#CC785C',
  mist: '#F5F5F4',
  contrast: 1.02,
  saturation: 0.9,
  splatScale: 1.28,
  splatRotation: -28,
};

const HOME_CAMERA = {
  position: { x: -4.6, y: 1.82, z: 4.05 },
  target: { x: -2.85, y: 0.26, z: 2.8 },
};

const STORY = [
  {
    key: 'arrival',
    eyebrow: 'I',
    title: 'Ankommen',
    short: 'Vom Alltag in ein langsameres Tempo.',
    body: 'PAASLEBEN liegt in Grasleben und wirkt wie eine bewusste Schwelle: raus aus Meeting-Routinen, rein in ein Areal, das Fokus, Natur und Bewegung zusammenbringt.',
  },
  {
    key: 'focus',
    eyebrow: 'II',
    title: 'Focus-Zeit',
    short: 'Arbeiten am Wesentlichen.',
    body: 'Die Website von Maren Paas beschreibt PAASLEBEN als Ort fur Focus-Zeiten, an dem Fuhrungsteams Abstand gewinnen, Prioritaten sortieren und Entscheidungen konzentriert vorbereiten.',
  },
  {
    key: 'horses',
    eyebrow: 'III',
    title: 'Pferde & Resonanz',
    short: 'Direktes Feedback ohne Rollenmaske.',
    body: 'Maren Paas arbeitet im Coaching auch mit Pferden. Das passt zur 3D-Erfahrung: weniger erklaren, mehr beobachten, wie Haltung, Abstand und Aufmerksamkeit den Raum verandern.',
  },
  {
    key: 'landart',
    eyebrow: 'IV',
    title: 'Skulpturen, Lofts, Land-Art',
    short: 'Umbau als Haltung.',
    body: 'Offentliche Retreat-Beschreibungen nennen aussergewohnliche Lofts, Skulpturen und Land-Art. Das Redesign nimmt diese kuratierte, fast kartografische Stimmung auf.',
  },
  {
    key: 'offsite',
    eyebrow: 'V',
    title: 'Offsite',
    short: 'Ein Ort fur Teams, die anders arbeiten wollen.',
    body: 'Die Seite ist nun weniger Tester und mehr Einladung: ein interaktiver Lageplan fur von Maren Paas gecoachte Unternehmen, mit ruhiger Orientierung statt UI-Larm.',
  },
];

const SPOT_COPY = [
  {
    name: 'Ankunft',
    subtitle: 'Der erste Blick auf das Areal.',
    chapters: ['Ankommen', 'Orientierung', 'Tempo wechseln'],
  },
  {
    name: 'Focus-Haus',
    subtitle: 'Raum fur Klarheit, Entscheidungen und Ruckzug.',
    chapters: ['Konzentrieren', 'Sortieren', 'Entscheiden'],
  },
  {
    name: 'Hof & Mitte',
    subtitle: 'Der soziale Schwerpunkt zwischen Arbeit und Aufenthalt.',
    chapters: ['Sammeln', 'Ubergange', 'Gesprache'],
  },
  {
    name: 'Pferde-Zeit',
    subtitle: 'Coaching im direkten Kontakt mit Resonanz.',
    chapters: ['Wahrnehmung', 'Haltung', 'Feedback'],
  },
  {
    name: 'Loft',
    subtitle: 'Umbau, Gastlichkeit und Arbeitsruhe.',
    chapters: ['Ruckzug', 'Material', 'Nacht'],
  },
  {
    name: 'Land-Art',
    subtitle: 'Skulpturen und Natur als offene Denkflache.',
    chapters: ['Blickachsen', 'Spuren', 'Weite'],
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const roman = (index) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][index] ?? `${index + 1}`;

const normalizeName = (rawName, index) => {
  const fallback = SPOT_COPY[index % SPOT_COPY.length].name;
  const cleaned = (rawName || fallback).replace(/[\s_.-]*\d+$/, '').trim();
  if (!cleaned) return fallback;
  if (cleaned.toLowerCase().includes('eingang')) return 'Ankunft';
  return cleaned;
};

const buildSpotNarrative = (spot, index) => {
  const template = SPOT_COPY[index % SPOT_COPY.length];
  const chapters = template.chapters.map((title, chapterIndex) => ({
    title,
    text: [
      `${spot.name} markiert einen Lesepunkt im 3D-Raum.`,
      STORY[(index + chapterIndex) % STORY.length].body,
      'Die Kamerafahrt bleibt bewusst ruhig, damit die Materialitat der Splat-Szene und die Orientierung im Areal im Vordergrund stehen.',
    ].join(' '),
  }));

  return chapters;
};

const boot = async () => {
  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <div id="experience-shell">
      <div class="paper-field" aria-hidden="true"></div>

      <header id="topbar">
        <button id="menu-button" class="map-word-button" type="button" aria-label="Ortskapitel anzeigen">
          <span>ME</span><span>NU</span>
        </button>
        <p class="topbar-location">Grasleben · Naturareal · Offsite</p>
        <button id="map-button" class="map-word-button map-word-button-right" type="button" aria-label="Standorte anzeigen">
          <span>CARTE</span>
        </button>
      </header>

      <section id="scene-stage" aria-label="Interaktive 3D-Karte von PAASLEBEN">
        <div id="viewport-wrapper">
          <div id="viewport"></div>
          <div id="labels-container"></div>
        </div>

        <article id="intro-panel" class="editorial-panel">
          <p class="eyebrow">PAASLEBEN</p>
          <h1>Ein Ort fur Fokus, Natur und Fuhrung.</h1>
          <p>
            Interaktive 3D-Erkundung des umgebauten Areals in Grasleben: Offsites,
            Focus-Zeiten, Coaching mit Pferden und ein Ort, an dem Arbeit Abstand bekommt.
          </p>
          <div class="fact-row" aria-label="Kurzprofil">
            <span>Focus-Zeit</span>
            <span>Pferde-Zeit</span>
            <span>Land-Art</span>
          </div>
          <div class="panel-actions">
            <button id="start-tour" class="primary-action" type="button">Rundgang</button>
            <button id="reset-view" class="line-action" type="button">Ansicht resetten</button>
          </div>
        </article>

        <nav id="chapter-rail" aria-label="PAASLEBEN Kapitel"></nav>

        <aside id="place-sheet" aria-label="Standorte und Kontext">
          <div class="sheet-header">
            <p class="eyebrow">Standorte</p>
            <button id="sheet-close" class="icon-button" type="button" aria-label="Standortliste schliessen">×</button>
          </div>
          <div id="spot-list"></div>
          <article id="spot-detail">
            <p class="detail-index">I</p>
            <h2>PAASLEBEN lesen</h2>
            <p>Wahle einen Punkt in der Szene oder links in der Liste. Die Kamera bewegt sich sanft zum Standort, der Text ordnet den Ort ein.</p>
          </article>
        </aside>

        <footer id="map-scale" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </footer>
      </section>
    </div>
  `;

  const viewport = root.querySelector('#viewport');
  const labelsContainer = root.querySelector('#labels-container');
  const spotList = root.querySelector('#spot-list');
  const spotDetail = root.querySelector('#spot-detail');
  const chapterRail = root.querySelector('#chapter-rail');
  const placeSheet = root.querySelector('#place-sheet');
  const menuButton = root.querySelector('#menu-button');
  const mapButton = root.querySelector('#map-button');
  const sheetClose = root.querySelector('#sheet-close');
  const startTourButton = root.querySelector('#start-tour');
  const resetViewButton = root.querySelector('#reset-view');

  if (
    !(viewport instanceof HTMLElement)
    || !(labelsContainer instanceof HTMLElement)
    || !(spotList instanceof HTMLElement)
    || !(spotDetail instanceof HTMLElement)
    || !(chapterRail instanceof HTMLElement)
    || !(placeSheet instanceof HTMLElement)
  ) return;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(SCENE_STYLE.paper, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Interaktive 3D-Ansicht von PAASLEBEN');

  let currentPixelRatio = Math.min(window.devicePixelRatio, 1.35);
  const minPixelRatio = 0.72;
  const maxPixelRatio = Math.min(window.devicePixelRatio, 1.55);
  renderer.setPixelRatio(currentPixelRatio);
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 500);
  camera.position.set(HOME_CAMERA.position.x, HOME_CAMERA.position.y, HOME_CAMERA.position.z);

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

  const controls = new GaussianSplats3D.OrbitControls(camera, renderer.domElement);
  controls.target.set(HOME_CAMERA.target.x, HOME_CAMERA.target.y, HOME_CAMERA.target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.rotateSpeed = 0.48;
  controls.zoomSpeed = 0.72;
  controls.panSpeed = 0.42;
  controls.minDistance = 1.45;
  controls.maxDistance = 10;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.76;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.update();

  const homeCameraPosition = camera.position.clone();
  const homeTargetPosition = controls.target.clone();
  const up = new THREE.Vector3(0, 1, 0);
  const labelProjection = new THREE.Vector3();
  const labelsToUpdate = [];
  const spots = [];

  let renderInvalidated = true;
  let isLoaded = false;
  let isTweening = false;
  let activeSpotId = null;
  let activeChapter = 0;

  const invalidate = () => {
    renderInvalidated = true;
  };

  const resize = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width < 2 || height < 2) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    invalidate();
  };

  new ResizeObserver(resize).observe(viewport);
  resize();

  const applySceneStyling = () => {
    viewport.style.backgroundColor = SCENE_STYLE.paper;
    renderer.domElement.style.filter = `contrast(${SCENE_STYLE.contrast}) saturate(${SCENE_STYLE.saturation})`;
  };

  const applySplatTransform = () => {
    if (!viewer.splatMesh) return;
    viewer.splatMesh.quaternion.setFromAxisAngle(up, THREE.MathUtils.degToRad(SCENE_STYLE.splatRotation));
    viewer.splatMesh.setSplatScale(SCENE_STYLE.splatScale);
    invalidate();
  };

  const setActiveChapter = (index) => {
    activeChapter = index;
    root.style.setProperty('--chapter-progress', `${index / Math.max(STORY.length - 1, 1)}`);
    chapterRail.querySelectorAll('.chapter-button').forEach((button, buttonIndex) => {
      button.classList.toggle('active', buttonIndex === index);
    });
  };

  const focusHome = () => {
    isTweening = true;
    activeSpotId = null;
    labelsContainer.classList.remove('labels-muted');
    spotList.querySelectorAll('.spot-button').forEach((button) => button.classList.remove('active'));

    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);

    gsap.to(controls.target, {
      x: homeTargetPosition.x,
      y: homeTargetPosition.y,
      z: homeTargetPosition.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: invalidate,
    });

    gsap.to(camera.position, {
      x: homeCameraPosition.x,
      y: homeCameraPosition.y,
      z: homeCameraPosition.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        controls.update();
        invalidate();
      },
      onComplete: () => {
        isTweening = false;
      },
    });
  };

  const renderSpotDetail = (spot) => {
    spotDetail.innerHTML = `
      <p class="detail-index">${spot.marker}</p>
      <h2>${spot.name}</h2>
      <p>${spot.subtitle}</p>
      <div class="detail-chapters">
        ${spot.chapters.map((chapter) => `
          <section>
            <h3>${chapter.title}</h3>
            <p>${chapter.text}</p>
          </section>
        `).join('')}
      </div>
    `;
  };

  const openSheet = () => {
    placeSheet.classList.add('open');
    document.body.classList.add('sheet-open');
  };

  const closeSheet = () => {
    placeSheet.classList.remove('open');
    document.body.classList.remove('sheet-open');
  };

  const focusSpot = (spot, options = {}) => {
    if (!spot) return;

    const { open = true } = options;
    activeSpotId = spot.id;
    labelsContainer.classList.add('labels-muted');
    renderSpotDetail(spot);
    if (open) openSheet();

    spotList.querySelectorAll('.spot-button').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-spot-id') === spot.id);
    });

    const currentDirection = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (currentDirection.lengthSq() < 1e-7) currentDirection.set(0.2, 0.16, 1);
    currentDirection.normalize();

    const targetPosition = spot.position.clone();
    const distance = window.matchMedia('(max-width: 760px)').matches ? 3.15 : 2.55;
    const nextCameraPosition = targetPosition.clone().add(currentDirection.multiplyScalar(distance));
    nextCameraPosition.y = Math.max(nextCameraPosition.y, targetPosition.y + 0.7);

    isTweening = true;
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);

    gsap.to(controls.target, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: 1.05,
      ease: 'power2.inOut',
      onUpdate: invalidate,
    });

    gsap.to(camera.position, {
      x: nextCameraPosition.x,
      y: nextCameraPosition.y,
      z: nextCameraPosition.z,
      duration: 1.05,
      ease: 'power2.inOut',
      onUpdate: () => {
        controls.update();
        invalidate();
      },
      onComplete: () => {
        isTweening = false;
      },
    });
  };

  const createSpotButton = (spot) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spot-button';
    button.setAttribute('data-spot-id', spot.id);
    button.innerHTML = `
      <span>${spot.marker}</span>
      <strong>${spot.name}</strong>
      <small>${spot.subtitle}</small>
    `;
    button.addEventListener('click', () => focusSpot(spot, { open: true }));
    return button;
  };

  const renderSpotList = () => {
    spotList.innerHTML = '';
    spots.forEach((spot) => spotList.appendChild(createSpotButton(spot)));
  };

  const renderChapterRail = () => {
    chapterRail.innerHTML = STORY.map((chapter, index) => `
      <button class="chapter-button${index === activeChapter ? ' active' : ''}" type="button" data-chapter="${index}">
        <span>${chapter.eyebrow}</span>
        <strong>${chapter.title}</strong>
      </button>
    `).join('');

    chapterRail.querySelectorAll('.chapter-button').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-chapter') ?? 0);
        setActiveChapter(index);
        spotDetail.innerHTML = `
          <p class="detail-index">${STORY[index].eyebrow}</p>
          <h2>${STORY[index].title}</h2>
          <p>${STORY[index].short}</p>
          <div class="detail-chapters">
            <section>
              <h3>Kontext</h3>
              <p>${STORY[index].body}</p>
            </section>
          </div>
        `;
        openSheet();
      });
    });
  };

  const updateLabels = () => {
    const widthHalf = viewport.clientWidth / 2;
    const heightHalf = viewport.clientHeight / 2;

    for (const labelEntry of labelsToUpdate) {
      labelProjection.copy(labelEntry.worldPosition).project(camera);

      if (labelProjection.z > 1 || labelProjection.z < -1) {
        labelEntry.element.hidden = true;
        continue;
      }

      labelEntry.element.hidden = false;
      const x = labelProjection.x * widthHalf + widthHalf;
      const y = -labelProjection.y * heightHalf + heightHalf;
      labelEntry.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      labelEntry.element.classList.toggle('active', labelEntry.spotId === activeSpotId);
    }
  };

  menuButton?.addEventListener('click', () => {
    setActiveChapter(activeChapter);
    openSheet();
  });

  mapButton?.addEventListener('click', () => {
    openSheet();
  });

  sheetClose?.addEventListener('click', closeSheet);
  startTourButton?.addEventListener('click', () => {
    setActiveChapter(0);
    if (spots[0]) focusSpot(spots[0], { open: true });
    else openSheet();
  });
  resetViewButton?.addEventListener('click', focusHome);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheet();
  });

  renderChapterRail();
  applySceneStyling();

  try {
    await viewer.addSplatScene(SCENE_SPLAT_PATH, {
      showLoadingUI: false,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
      position: [0, 0, 0],
      rotation: [
        Math.sin(THREE.MathUtils.degToRad(SCENE_STYLE.splatRotation) / 2),
        0,
        Math.cos(THREE.MathUtils.degToRad(SCENE_STYLE.splatRotation) / 2),
        0,
      ],
      scale: [1.2, 1.2, 1.2],
    });

    isLoaded = true;
    applySplatTransform();

    const loader = document.querySelector('#loading-overlay');
    if (loader instanceof HTMLElement) loader.classList.add('hidden');

    const gltfLoader = new GLTFLoader();
    gltfLoader.load(MODEL_PATH, (gltf) => {
      gltf.scene.rotation.y = -Math.PI / 2;
      viewer.scene?.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);

      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        node.visible = false;

        const index = spots.length;
        const position = new THREE.Vector3();
        node.getWorldPosition(position);

        const copy = SPOT_COPY[index % SPOT_COPY.length];
        const spot = {
          id: `spot-${index + 1}`,
          marker: roman(index),
          name: normalizeName(node.name, index),
          subtitle: copy.subtitle,
          position: position.clone(),
          chapters: [],
        };
        spot.chapters = buildSpotNarrative(spot, index);
        spots.push(spot);

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'splat-label';
        label.innerHTML = `<span>${spot.marker}</span><strong>${spot.name}</strong>`;
        label.addEventListener('click', () => focusSpot(spot, { open: true }));

        labelsContainer.appendChild(label);
        labelsToUpdate.push({
          element: label,
          worldPosition: position.clone(),
          spotId: spot.id,
        });
      });

      renderSpotList();
      invalidate();
    });
  } catch (error) {
    const loader = document.querySelector('#loading-overlay');
    if (loader instanceof HTMLElement) {
      loader.querySelector('p').textContent = 'Die 3D-Szene konnte nicht geladen werden.';
    }
    console.error(error);
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
      } else if (fps > 54 && currentPixelRatio < maxPixelRatio - 0.05) {
        currentPixelRatio = clamp(currentPixelRatio + 0.05, minPixelRatio, maxPixelRatio);
        renderer.setPixelRatio(currentPixelRatio);
        resize();
      }
      perfAccumulatedMs = 0;
      perfFrameCount = 0;
    }

    controls.update();

    const shouldRender = renderInvalidated || isTweening || !isLoaded;
    if (!shouldRender) return;

    renderInvalidated = false;
    viewer.update();
    viewer.render();

    if (labelTick % 2 === 0) updateLabels();
    labelTick += 1;
  };

  animate();
};

void boot();
