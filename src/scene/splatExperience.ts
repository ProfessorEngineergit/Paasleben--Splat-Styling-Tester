import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  Clock,
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { StyleSettings } from '../presets/types';
import { computeSceneBounds, type SceneBounds } from './bounds';
import { AtmosphereLayers } from './atmosphereLayers';
import { PostProcessor } from '../render/postProcessor';

export class SplatExperience {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly postProcessor: PostProcessor;
  readonly atmosphereLayers: AtmosphereLayers;

  private readonly clock = new Clock();
  private readonly mount: HTMLElement;
  private dropInViewer: any;
  private bounds: SceneBounds | null = null;
  private frameHandle = 0;

  constructor(mount: HTMLElement) {
    this.mount = mount;

    this.scene = new Scene();
    this.scene.background = new Color('#ece8df');

    this.camera = new PerspectiveCamera(52, 1, 0.1, 1200);
    this.camera.position.set(0, 2.5, 8);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
    this.mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.set(0, 1, 0);

    this.atmosphereLayers = new AtmosphereLayers();
    this.scene.add(this.atmosphereLayers.group);

    this.postProcessor = new PostProcessor(this.renderer, this.scene, this.camera);

    window.addEventListener('resize', this.onResize);
  }

  async loadSplat(path: string, onProgress?: (percent: number) => void): Promise<void> {
    this.dropInViewer = new GaussianSplats3D.DropInViewer({
      gpuAcceleratedSort: true,
      sharedMemoryForWorkers: false,
      integerBasedSort: false,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
      sphericalHarmonicsDegree: 0,
      enableOptionalEffects: true,
      kernel2DSize: 0.3,
    });

    this.scene.add(this.dropInViewer);
    await this.dropInViewer.addSplatScene(path, {
      showLoadingUI: false,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 5,
      onProgress: (percent: number, percentLabel: string) => {
        if (!onProgress) return;
        const numericPercent = Number.isFinite(percent)
          ? percent
          : Number.parseFloat(percentLabel ?? '') || 0;
        onProgress(Math.max(0, Math.min(100, numericPercent)));
      },
    });

    const splatMesh = this.dropInViewer?.viewer?.getSplatMesh?.();
    if (!splatMesh) return;

    this.bounds = computeSceneBounds(splatMesh);
    this.controls.target.copy(this.bounds.center);

    const framing = Math.max(this.bounds.radius * 2.3, 6);
    this.camera.position.copy(this.bounds.center).add(new Vector3(framing * 0.35, framing * 0.18, framing));
    this.camera.near = Math.max(0.03, this.bounds.radius * 0.01);
    this.camera.far = Math.max(120, this.bounds.radius * 20);
    this.camera.updateProjectionMatrix();

    this.atmosphereLayers.layout(this.bounds);
    this.controls.update();
  }

  start(settingsGetter: () => StyleSettings): void {
    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick);
      const settings = settingsGetter();
      this.applySettings(settings);
      this.controls.update();
      this.postProcessor.update(settings, this.bounds, this.camera, this.clock.getElapsedTime());
      this.atmosphereLayers.update(settings, this.camera, this.clock.getElapsedTime());
      this.postProcessor.render();
    };

    tick();
  }

  screenshot(): void {
    const link = document.createElement('a');
    link.href = this.renderer.domElement.toDataURL('image/png');
    link.download = `splat-style-${Date.now()}.png`;
    link.click();
  }

  getBounds(): SceneBounds | null {
    return this.bounds;
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.postProcessor.composer.dispose();
    this.renderer.dispose();
    this.dropInViewer?.dispose?.();
  }

  private applySettings(settings: StyleSettings): void {
    this.scene.background = new Color(settings.backgroundColor);

    this.controls.autoRotate = settings.autoRotate;
    this.controls.autoRotateSpeed = settings.autoRotateSpeed;
    this.controls.minDistance = settings.minDistance;
    this.controls.maxDistance = settings.maxDistance;

    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();

    const splatMesh = this.dropInViewer?.viewer?.getSplatMesh?.();
    if (splatMesh?.setSplatScale) {
      splatMesh.setSplatScale(settings.splatScale);
    }

    const sceneCount: number = this.dropInViewer?.viewer?.getSceneCount?.() ?? 0;
    for (let i = 0; i < sceneCount; i++) {
      const splatScene = this.dropInViewer?.viewer?.getSplatScene?.(i);
      if (splatScene) {
        splatScene.opacity = settings.opacity;
      }
    }
  }

  private onResize = (): void => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postProcessor.setSize(width, height);
  };
}
