import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const REDUZIERT = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODEL_URL = `${import.meta.env.BASE_URL}models/stork-flight-v1.glb`;

/**
 * Echte 3D-Störche über dem Splat. Sie leben in einem eigenen transparenten
 * WebGL-Layer, teilen aber dieselbe Kamera. So bleiben sie räumlich am Areal,
 * ohne in die spezielle Render-Pipeline des Gaussian-Splats einzugreifen.
 */
export const createSky = (host, { camera, getBounds } = {}) => {
  let el;
  let renderer;
  let scene;
  let source;
  let clips = [];
  let loadPromise;
  let wanted = false;
  let running = false;
  let raf = 0;
  let last = 0;
  const birds = [];

  const bounds = () => {
    const b = getBounds?.() || {};
    return {
      minX: Number.isFinite(b.minX) ? b.minX : -4,
      maxX: Number.isFinite(b.maxX) ? b.maxX : 3,
      minZ: Number.isFinite(b.minZ) ? b.minZ : -2.5,
      maxZ: Number.isFinite(b.maxZ) ? b.maxZ : 2.5,
      y: Number.isFinite(b.y) ? b.y : 2.2,
    };
  };

  const resize = () => {
    if (!renderer) return;
    const w = host.clientWidth || innerWidth;
    const h = host.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
  };

  const build = () => {
    if (el) return;
    el = document.createElement('div');
    el.className = 'paas-sky';
    el.setAttribute('aria-hidden', 'true');
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'sky-canvas';
    el.appendChild(renderer.domElement);
    host.appendChild(el);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff7df, 0x776e61, 2.25));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(-4, 8, 3);
    scene.add(sun);
    resize();
    addEventListener('resize', resize, { passive: true });
  };

  const parkBird = (bird, delaySeconds) => {
    bird.active = false;
    bird.object.visible = false;
    bird.nextLaunch = performance.now() / 1000 + delaySeconds;
  };

  const launchBird = (bird, { opening = false } = {}) => {
    const b = bounds();
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    // Der erste Vogel sitzt beim Öffnen direkt an der Geländekante und fliegt
    // sichtbar ins Bild. Spätere Starts und jedes Flugziel liegen weit hinter
    // dem maximal erreichbaren Kartenrand, damit beim Verschieben niemals ein
    // Storch sichtbar wegpoppt.
    const edgePad = Math.max(0.30, span * 0.045);
    const outerPad = Math.max(2.4, span * 0.72);
    const startPad = opening ? edgePad : outerPad;
    const destinationPad = outerPad;
    const y = b.y + 1.65 + Math.random() * 0.62;
    const start = new THREE.Vector3();
    const destination = new THREE.Vector3();
    const route = Math.floor(Math.random() * 4);
    const alongA = 0.10 + Math.random() * 0.80;
    const alongB = THREE.MathUtils.clamp(alongA + (Math.random() - 0.5) * 0.42, 0.06, 0.94);
    if (route === 0) { // West → Ost
      start.set(b.minX - startPad, y, THREE.MathUtils.lerp(b.minZ, b.maxZ, alongA));
      destination.set(b.maxX + destinationPad, y, THREE.MathUtils.lerp(b.minZ, b.maxZ, alongB));
    } else if (route === 1) { // Ost → West
      start.set(b.maxX + startPad, y, THREE.MathUtils.lerp(b.minZ, b.maxZ, alongA));
      destination.set(b.minX - destinationPad, y, THREE.MathUtils.lerp(b.minZ, b.maxZ, alongB));
    } else if (route === 2) { // Nord → Süd
      start.set(THREE.MathUtils.lerp(b.minX, b.maxX, alongA), y, b.minZ - startPad);
      destination.set(THREE.MathUtils.lerp(b.minX, b.maxX, alongB), y, b.maxZ + destinationPad);
    } else { // Süd → Nord
      start.set(THREE.MathUtils.lerp(b.minX, b.maxX, alongA), y, b.maxZ + startPad);
      destination.set(THREE.MathUtils.lerp(b.minX, b.maxX, alongB), y, b.minZ - destinationPad);
    }
    bird.object.position.copy(start);
    bird.destination.copy(destination);
    bird.velocity.subVectors(destination, start).normalize().multiplyScalar(0.20 + Math.random() * 0.055);
    // Das Modell blickt nach -Z. Den Yaw direkt aus dem Bewegungsvektor
    // ableiten; so kann der Schnabel niemals entgegen der Flugbahn zeigen.
    bird.object.rotation.set(0, Math.atan2(-bird.velocity.x, -bird.velocity.z), 0);
    const scale = 0.065 + Math.random() * 0.017;
    bird.object.scale.setScalar(scale);
    bird.object.visible = true;
    bird.active = true;
  };

  const addBirds = () => {
    if (!source || birds.length) return;
    const count = 2;
    for (let i = 0; i < count; i++) {
      const object = source.clone(true);
      object.traverse((node) => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        node.castShadow = false;
        node.receiveShadow = false;
      });
      scene.add(object);
      const mixer = clips.length ? new THREE.AnimationMixer(object) : null;
      if (mixer) {
        // Blender exportiert Root und beide Flügel als drei Clips. Alle drei
        // synchron starten, sonst würde nur ein Flügel oder nur der Rumpf
        // animieren.
        const speed = 0.72 + Math.random() * 0.18;
        const phase = Math.random();
        for (const clip of clips) {
          const action = mixer.clipAction(clip);
          action.timeScale = speed;
          action.play();
          action.time = phase * Math.max(0.1, clip.duration);
        }
      }
      const bird = { index: i, object, mixer, velocity: new THREE.Vector3(), destination: new THREE.Vector3() };
      birds.push(bird);
      // Nicht sofort mit einem Schwarm beginnen. Ein einzelner Vogel taucht
      // nach kurzer Ruhe auf, der zweite erst deutlich später.
      parkBird(bird, i === 0 ? 2.2 + Math.random() * 2.8 : 22 + Math.random() * 20);
    }
  };

  const load = () => {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve) => {
      new GLTFLoader().load(MODEL_URL, (gltf) => {
        source = gltf.scene;
        clips = gltf.animations || [];
        addBirds();
        resolve();
      }, undefined, (error) => {
        console.warn('3D-Storch konnte nicht geladen werden:', error);
        resolve();
      });
    });
    return loadPromise;
  };

  const render = (dt) => {
    if (!renderer || !camera) return;
    const now = performance.now() / 1000;
    for (const bird of birds) {
      if (!bird.active && now >= bird.nextLaunch) launchBird(bird);
      if (bird.active && !REDUZIERT) {
        bird.object.position.addScaledVector(bird.velocity, dt);
        bird.mixer?.update(dt);
      }
      if (bird.active && bird.object.position.distanceToSquared(bird.destination) < 0.035) {
        parkBird(bird, 20 + Math.random() * 30);
      }
    }
    renderer.render(scene, camera);
  };

  const tick = (now) => {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    render(dt);
    raf = requestAnimationFrame(tick);
  };

  return {
    // WebGL-Kontext und Modell in einer ruhigen Browserphase vorbereiten.
    // Der erste Birdseye-Klick muss dann keinen zweiten Renderer mehr bauen
    // und verliert beim Umschalten keinen UI-Frame.
    prepare() {
      build();
      return load();
    },
    async show() {
      wanted = true;
      build();
      await load();
      if (!wanted) return;
      el?.classList.add('is-on');
      if (running) return;
      running = true;
      last = 0;
      // Sofort ein einzelner Storch an der nahen Grenze. Der zweite bleibt
      // bewusst selten und startet wie alle Folgeflüge weit außerhalb.
      birds.forEach((bird, index) => parkBird(bird, index === 0 ? 0 : 18 + Math.random() * 24));
      if (birds[0]) launchBird(birds[0], { opening: true });
      render(0);
      raf = requestAnimationFrame(tick);
    },
    hide() {
      wanted = false;
      el?.classList.remove('is-on');
      running = false;
      cancelAnimationFrame(raf);
    },
    get element() { return el; },
  };
};
