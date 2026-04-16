import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeSceneBounds, type SceneBounds } from './bounds';
import { AtmosphereLayers } from './atmosphereLayers';
import { PostProcessor } from '../render/postProcessor';
import { buildSettingsFromPreset, DEFAULT_PRESET } from '../presets/presets';
import type { StyleSettings } from '../presets/types';

export class SplatExperience {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly atmosphereLayers: AtmosphereLayers;

  private readonly mount: HTMLElement;
  private readonly postProcessor: PostProcessor;
  private viewer: any;
  private bounds: SceneBounds | null = null;
  private frameHandle = 0;
  private settings: StyleSettings;
  private startTime = 0;

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.settings = buildSettingsFromPreset(DEFAULT_PRESET);

    this.scene = new Scene();
    this.scene.background = new Color(this.settings.backgroundColor);

    this.camera = new PerspectiveCamera(this.settings.fov, 1, 0.1, 1200);
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

  setSettings(settings: StyleSettings): void {
    this.settings = settings;
    this.scene.background = new Color(settings.backgroundColor);
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
    this.controls.autoRotate = settings.autoRotate;
    this.controls.autoRotateSpeed = settings.autoRotateSpeed;
    this.controls.minDistance = settings.minDistance;
    this.controls.maxDistance = settings.maxDistance;
  }

  async loadSplat(path: string, onProgress?: (percent: number) => void): Promise<void> {
    this.viewer = new GaussianSplats3D.Viewer({
      selfDrivenMode: false,
      useBuiltInControls: false,
      renderer: this.renderer,
      camera: this.camera,
      threeScene: this.scene,
      gpuAcceleratedSort: true,
      sharedMemoryForWorkers: false,
      integerBasedSort: false,
      sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
      sphericalHarmonicsDegree: 0,
      enableOptionalEffects: false,
      kernel2DSize: 0.6,
    });

    await this.viewer.addSplatScene(path, {
      showLoadingUI: false,
      progressiveLoad: true,
      splatAlphaRemovalThreshold: 0,
      onProgress: (percent: number, percentLabel: string) => {
        if (!onProgress) return;
        const numericPercent = Number.isFinite(percent)
          ? percent
          : Number.parseFloat(percentLabel ?? '') || 0;
        onProgress(Math.max(0, Math.min(100, numericPercent)));
      },
    });

    const splatMesh = this.viewer.splatMesh;
    if (!splatMesh) return;

    this.bounds = computeSceneBounds(splatMesh);
    this.controls.target.copy(this.bounds.center);
    this.atmosphereLayers.layout(this.bounds);

    const framing = Math.max(this.bounds.radius * 2.3, 6);
    this.camera.position.copy(this.bounds.center).add(new Vector3(framing * 0.35, framing * 0.18, framing));
    this.camera.near = Math.max(0.03, this.bounds.radius * 0.01);
    this.camera.far = Math.max(120, this.bounds.radius * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  start(onFrame?: () => void): void {
    this.startTime = performance.now();

    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick);
      this.controls.update();
      this.viewer?.update?.();

      const elapsedSeconds = (performance.now() - this.startTime) / 1000;
      this.atmosphereLayers.update(this.settings, this.camera, elapsedSeconds);
      this.postProcessor.update(this.settings, this.bounds, this.camera, elapsedSeconds);
      onFrame?.();
      this.postProcessor.render();
    };

    tick();
  }

  getBounds(): SceneBounds | null {
    return this.bounds;
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.viewer?.dispose?.();
  }

  private onResize = (): void => {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postProcessor.setSize(width, height);
  };
}
