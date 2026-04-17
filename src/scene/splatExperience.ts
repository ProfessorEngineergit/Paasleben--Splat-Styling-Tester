import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  Color,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  Clock
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { computeSceneBounds, type SceneBounds } from './bounds';
import { PostProcessor } from '../render/postProcessor';

export class SplatExperience {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly postProcessor: PostProcessor;
  
  public onTick?: (elapsedSeconds: number) => void;

  private readonly mount: HTMLElement;
  private viewer: any;
  private bounds: SceneBounds | null = null;
  private frameHandle = 0;
  private clock = new Clock();

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

    // Initialisiere die Shader/Stil-Pipeline
    this.postProcessor = new PostProcessor(this.renderer, this.scene, this.camera);
    this.postProcessor.setSize(this.mount.clientWidth, this.mount.clientHeight);

    window.addEventListener('resize', this.onResize);
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

    // BUGFIX: splatMesh ist eine Eigenschaft auf dem Viewer in neueren Versionen!
    const splatMesh = this.viewer?.splatMesh;
    if (!splatMesh) return;

    this.bounds = computeSceneBounds(splatMesh);
    this.controls.target.copy(this.bounds.center);

    const framing = Math.max(this.bounds.radius * 2.3, 6);
    this.camera.position.copy(this.bounds.center).add(new Vector3(framing * 0.35, framing * 0.18, framing));
    this.camera.near = Math.max(0.03, this.bounds.radius * 0.01);
    this.camera.far = Math.max(120, this.bounds.radius * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  start(): void {
    this.clock.start();
    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick);
      this.controls.update();
      this.viewer?.update?.();
      
      const elapsed = this.clock.getElapsedTime();
      
      // Benachrichtige app.ts über Frame-Update (für UI/Marker und Uniforms)
      if (this.onTick) this.onTick(elapsed);

      // Render mit allen Shadern und Fog anstelle von this.viewer.render()
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
