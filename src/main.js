import './style.css';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

const SCENE_SPLAT_PATH = `${import.meta.env.BASE_URL}scene.splat`;

const boot = async () => {
  const root = document.querySelector('#app');
  if (!root) return;

  root.innerHTML = `
    <div id="viewport"></div>
    <div id="status">Lade Splat…</div>
  `;

  const viewport = root.querySelector('#viewport');
  const status = root.querySelector('#status');
  if (!viewport || !status) return;

  const viewer = new GaussianSplats3D.Viewer({
    selfDrivenMode: true,
    useBuiltInControls: true,
    rootElement: viewport,
    sharedMemoryForWorkers: false,
    sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
    initialCameraPosition: [0, 0, 8],
    initialCameraLookAt: [0, 0, 0],
  });

  try {
    await viewer.addSplatScene(SCENE_SPLAT_PATH, {
      showLoadingUI: true,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1.2, 1.2, 1.2],
    });

    viewer.start();
    status.remove();
  } catch (error) {
    status.textContent = `Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`;
  }
};

void boot();
