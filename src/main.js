import './style.css';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.splat`;

const MOVE_BOUNDS = {
  minX: -3.5,
  maxX: 3.5,
  minZ: -3.5,
  maxZ: 3.5,
};

const STYLE_STATE = {
  backgroundColor: '#0a0a0b',
  paperTextureEnabled: true,
  textureTarget: 'viewport',
  textureIntensity: 0.15,
  sketchLookEnabled: true,
  contrast: 1.25,
  saturation: 0.75,
  splatScale: 1.4,
  splatRotation: -28,
};

const boot = async () => {
  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <div id="layout">
      

      <div id="viewport-wrapper">
        <div id="viewport"></div>
        <div id="labels-container"></div>
        <div id="viewport-texture-overlay" class="paper-overlay"></div>
      </div>
    </div>
  `;

  const viewport = root.querySelector('#viewport');
  const viewportWrapper = root.querySelector('#viewport-wrapper');
  if (!viewport || !viewportWrapper) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0); // Transparent renderer background
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
  camera.position.set(0, 0.5, 8);

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
  orbitControls.target.set(0, 0, 0);
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

  const resize = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(viewport);

  resize();

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const previousPointer = new THREE.Vector2();
  let isLeftDragging = false;
  let isSplatSceneLoaded = false;

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
      THREE.MathUtils.clamp(orbitControls.target.x, MOVE_BOUNDS.minX, MOVE_BOUNDS.maxX),
      orbitControls.target.y,
      THREE.MathUtils.clamp(orbitControls.target.z, MOVE_BOUNDS.minZ, MOVE_BOUNDS.maxZ),
    );

    camera.position.add(orbitControls.target.clone().sub(previousTarget));
  };

  renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    isLeftDragging = true;
    previousPointer.set(event.clientX, event.clientY);
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!isLeftDragging) return;

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
  };

  renderer.domElement.addEventListener('pointerup', stopLeftDrag);
  renderer.domElement.addEventListener('pointercancel', stopLeftDrag);

  const applyStylingState = () => {
    viewport.style.backgroundColor = STYLE_STATE.backgroundColor;
    document.body.style.backgroundColor = STYLE_STATE.backgroundColor;
    renderer.setClearColor(STYLE_STATE.backgroundColor, 0);

    const filters = [
      `contrast(${STYLE_STATE.contrast})`,
      `saturate(${STYLE_STATE.saturation})`,
    ];

    if (STYLE_STATE.sketchLookEnabled) {
      filters.unshift('grayscale(0.35)');
      filters.push('sepia(0.18)');
    }

    renderer.domElement.style.filter = filters.join(' ');

    const textureOpacity = STYLE_STATE.paperTextureEnabled ? STYLE_STATE.textureIntensity : 0;
    root.style.setProperty('--paper-opacity', textureOpacity.toString());

    root.classList.toggle(
      'texture-global',
      STYLE_STATE.paperTextureEnabled && STYLE_STATE.textureTarget === 'global',
    );

    viewportWrapper.classList.toggle(
      'texture-viewport',
      STYLE_STATE.paperTextureEnabled && STYLE_STATE.textureTarget === 'viewport',
    );

    if (isSplatSceneLoaded && viewer.splatMesh) {
      viewer.splatMesh.setSplatScale(STYLE_STATE.splatScale);
    }
  };

  applyStylingState();

  const labelsToUpdate = [];
  const labelsContainer = document.querySelector('#labels-container');
  const detailOverlay = document.querySelector('#detail-overlay');

  let initialCameraPos = new THREE.Vector3(0, 0.4, 2.5);
  let initialTargetPos = new THREE.Vector3(0, 0, 0);

  document.querySelector('#overlay-close')?.addEventListener('click', () => {
    detailOverlay.classList.add('hidden');
    
    

    gsap.to(orbitControls.target, {
      x: initialTargetPos.x, y: initialTargetPos.y, z: initialTargetPos.z,
      duration: 1.5,
      ease: 'power2.inOut'
    });
    gsap.to(camera.position, {
      x: initialCameraPos.x, y: initialCameraPos.y, z: initialCameraPos.z,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => orbitControls.update(),
      onComplete: () => {
        labelsContainer.style.pointerEvents = 'none'; // Re-enabled by CSS rule or keep it 'none' because CSS rules it. Wait, the labels themselves have pointer-events: auto. The container shouldn't block.
        labelsContainer.style.opacity = '1';
      }
    });
  });

  const gltfLoader = new GLTFLoader();
  gltfLoader.load(`${import.meta.env.BASE_URL}Paasleben.glb`, (gltf) => {
    // Schilder: 90 Grad drehen + 180 Grad Flip = -90 Grad ( -Math.PI / 2 ), damit der Eingang "am Anfang" ist
    gltf.scene.rotation.y = -Math.PI / 2;

    if (viewer.scene) {
      viewer.scene.add(gltf.scene);
    }
    gltf.scene.updateMatrixWorld(true);

    gltf.scene.traverse((node) => {
      if (node.isMesh || node.isObject3D) {
        if (node.isMesh) node.visible = false;
        
        // Create label only for meaningful nodes if preferred, but instructions say "each node/mesh"
        // Let's filter slightly so root node isn't included if not mesh, but "each node/mesh" -> let's do nodes with "Mesh" or just isMesh to be safe.
        if (node.isMesh) {
          const position = new THREE.Vector3();
          node.getWorldPosition(position);

          // Name and startup camera handling
          let displayName = node.name || 'Unnamed';
          // Entferne angehängte Zahlen wie .001, _002 oder Leerzeichen gefolgt von Zahlen für alle Schilder
          displayName = displayName.replace(/[\s_.]*\d+$/, '').trim();
          
          if (displayName.toLowerCase().includes('eingang')) {
            displayName = 'Willkommen';
            // Kamera-Startposition: etwas dunkler und reingezoomt
            initialTargetPos.copy(position);
            initialCameraPos.set(position.x, position.y + 0.8, position.z + 2.5);
            camera.position.copy(initialCameraPos);
            orbitControls.target.copy(initialTargetPos);
            orbitControls.update();
          }

          const label = document.createElement('div');
          label.className = 'splat-label';
          label.textContent = displayName;
          labelsContainer.appendChild(label);

          label.addEventListener('mouseenter', () => {
            const cursor = document.querySelector('#custom-cursor');
            cursor?.classList.add('hovering');
          });
          label.addEventListener('mouseleave', () => {
            const cursor = document.querySelector('#custom-cursor');
            cursor?.classList.remove('hovering');
          });
          
          label.addEventListener('click', () => {
            labelsContainer.style.pointerEvents = 'none';
            labelsContainer.style.opacity = '0';
            
            
            
            gsap.to(orbitControls.target, {
              x: position.x,
              y: position.y,
              z: position.z,
              duration: 1.5,
              ease: 'power2.inOut'
            });

            const dir = new THREE.Vector3().subVectors(camera.position, orbitControls.target).normalize();
            // Näher ranzoomen beim Klick, minDistance erlaubt es jetzt
            const dist = Math.max(orbitControls.minDistance, 2.5); 
            const newPos = position.clone().add(dir.multiplyScalar(dist));
            
            gsap.to(camera.position, {
              x: newPos.x,
              y: newPos.y,
              z: newPos.z,
              duration: 1.5,
              ease: 'power2.inOut',
              onUpdate: () => orbitControls.update(),
              onComplete: () => {
                const title = document.querySelector('#overlay-title');
                if (title) title.textContent = displayName;
                detailOverlay.classList.remove('hidden');
              }
            });
          });
          
          labelsToUpdate.push({ element: label, position });
        }
      }
    });
  });

  try {
    const initRotRad = THREE.MathUtils.degToRad(-28);
    const halfRad = initRotRad / 2;
    await viewer.addSplatScene(SCENE_SPLAT_PATH, {
      showLoadingUI: true,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
      position: [0, 0, 0],
      rotation: [Math.sin(halfRad), 0, Math.cos(halfRad), 0],
      scale: [1.2, 1.2, 1.2],
    });
    isSplatSceneLoaded = true;
    applyStylingState();

    const animate = () => {
      orbitControls.update();
      viewer.update();
      viewer.render();

      const widthHalf = viewport.clientWidth / 2;
      const heightHalf = viewport.clientHeight / 2;

      labelsToUpdate.forEach((labelObj) => {
        const v = labelObj.position.clone();
        v.project(camera);

        if (v.z > 1 || v.z < -1) {
          labelObj.element.style.display = 'none';
        } else {
          labelObj.element.style.display = 'block';
          const x = (v.x * widthHalf) + widthHalf;
          const y = -(v.y * heightHalf) + heightHalf;
          labelObj.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        }
      });

      requestAnimationFrame(animate);
    };

    animate();
  } catch (error) {
    console.error(`Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`);
  }
};

void boot();

// --- Custom Cursor Logic ---
const cursor = document.querySelector('#custom-cursor');
let isMouseDown = false;

window.addEventListener('mousemove', (e) => {
  if (cursor) {
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  }
});

window.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  if(e.button === 0 || e.button === 2) {
    cursor?.classList.add('rotating');
  }
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
  cursor?.classList.remove('rotating');
});

// Setup hovering logic dynamically for splat-labels
const checkHover = () => {
    const labels = document.querySelectorAll('.splat-label');
    labels.forEach(l => {
      l.addEventListener('mouseenter', () => cursor?.classList.add('hovering'));
      l.addEventListener('mouseleave', () => cursor?.classList.remove('hovering'));
    });
    
    const closeBtn = document.querySelector('#overlay-close');
    if(closeBtn) {
      closeBtn.addEventListener('mouseenter', () => cursor?.classList.add('hovering'));
      closeBtn.addEventListener('mouseleave', () => cursor?.classList.remove('hovering'));
    }
}
setTimeout(checkHover, 2500); // Check after labels get added
