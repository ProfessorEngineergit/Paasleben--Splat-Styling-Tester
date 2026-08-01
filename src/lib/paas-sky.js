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

  const resetBird = (bird, first = false) => {
    const b = bounds();
    const pad = 0.55;
    const angle = -0.58 + (Math.random() - 0.5) * 0.34;
    bird.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.22 + Math.random() * 0.09);
    bird.object.position.set(
      first ? THREE.MathUtils.lerp(b.minX, b.maxX, 0.24 + bird.index * 0.43) : b.minX - pad,
      b.y + 1.55 + Math.random() * 0.55,
      first
        ? THREE.MathUtils.lerp(b.minZ, b.maxZ, 0.24 + bird.index * 0.48)
        : THREE.MathUtils.lerp(b.minZ, b.maxZ, 0.15 + Math.random() * 0.7),
    );
    bird.object.lookAt(bird.object.position.clone().add(bird.velocity));
    const scale = 0.20 + Math.random() * 0.045;
    bird.object.scale.setScalar(scale);
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
      const bird = { index: i, object, mixer, velocity: new THREE.Vector3() };
      birds.push(bird);
      resetBird(bird, true);
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
    const b = bounds();
    for (const bird of birds) {
      if (!REDUZIERT) {
        bird.object.position.addScaledVector(bird.velocity, dt);
        bird.mixer?.update(dt);
      }
      if (bird.object.position.x > b.maxX + 0.8
          || bird.object.position.z < b.minZ - 0.8
          || bird.object.position.z > b.maxZ + 0.8) resetBird(bird);
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
    async show() {
      wanted = true;
      build();
      await load();
      if (!wanted) return;
      el?.classList.add('is-on');
      if (running) return;
      running = true;
      last = 0;
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
