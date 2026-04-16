import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import {
  AmbientLight,
  Box3,
  CanvasTexture,
  Clock,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { StyleSettings } from '../presets/types';
import { computeSceneBounds, type SceneBounds } from './bounds';
import { AtmosphereLayers } from './atmosphereLayers';
import { PostProcessor } from '../render/postProcessor';

const SIGN_FALLBACK_PREFIX = 'Bereich';

type DropInViewerHandle = Group & {
  viewer: {
    update: (renderer: WebGLRenderer, camera: PerspectiveCamera) => void;
    getSplatMesh?: () => any;
    getSceneCount?: () => number;
    getSplatScene?: (index: number) => { opacity: number } | null;
  };
  addSplatScene: (path: string, options?: Record<string, unknown>) => Promise<unknown>;
  dispose?: () => void;
};

export class SplatExperience {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly postProcessor: PostProcessor;
  readonly atmosphereLayers: AtmosphereLayers;

  private readonly clock = new Clock();
  private readonly mount: HTMLElement;
  private dropInViewer: DropInViewerHandle | null = null;
  private readonly gltfLoader = new GLTFLoader();
  private quaderRoot: Group | null = null;
  private readonly quaderSigns = new Group();
  private quaderLoadVersion = 0;
  private generatedSignCount = 0;
  private bounds: SceneBounds | null = null;
  private frameHandle = 0;

  constructor(mount: HTMLElement) {
    this.mount = mount;

    this.scene = new Scene();
    this.scene.background = new Color('#ece8df');
    this.scene.add(new AmbientLight('#ffffff', 1.45));
    const skyFill = new HemisphereLight('#f4f8ff', '#c7c0b3', 0.75);
    this.scene.add(skyFill);
    const keyLight = new DirectionalLight('#ffffff', 1.35);
    keyLight.position.set(5, 9, 6);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight('#dbe6ff', 0.75);
    rimLight.position.set(-6, 4, -5);
    this.scene.add(rimLight);

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
    this.scene.add(this.quaderSigns);

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
      enableOptionalEffects: false,
      kernel2DSize: 0.6,
    }) as DropInViewerHandle;

    this.scene.add(this.dropInViewer);
    await this.dropInViewer.addSplatScene(path, {
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
    await this.loadQuaderOverlay();
    this.controls.update();
  }

  start(settingsGetter: () => StyleSettings): void {
    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick);
      const settings = settingsGetter();
      this.applySettings(settings);
      this.controls.update();
      this.updateDropInViewer();
      this.postProcessor.update(settings, this.bounds, this.camera, this.clock.getElapsedTime());
      this.atmosphereLayers.update(settings, this.camera, this.clock.getElapsedTime());
      this.updateQuaderSignsFacingCamera();
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
    this.clearQuaderOverlay();
    this.dropInViewer?.dispose?.();
  }

  private async loadQuaderOverlay(): Promise<void> {
    const loadVersion = ++this.quaderLoadVersion;
    this.clearQuaderOverlay(false);
    this.generatedSignCount = 0;
    const glb = await this.tryLoadQuaderGlb();
    if (!glb || loadVersion !== this.quaderLoadVersion) return;

    this.quaderRoot = glb.scene;
    this.scene.add(this.quaderRoot);

    this.quaderRoot.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;

      const bounds = new Box3().setFromObject(mesh);
      if (bounds.isEmpty()) return;
      mesh.visible = false;

      const label = this.resolveSignLabel(mesh);

      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const sign = this.createTexturedSign(label, Math.max(size.x, 0.5));
      sign.position.set(center.x, bounds.max.y + Math.max(size.y * 0.18, 0.1), center.z);
      this.quaderSigns.add(sign);
    });
  }

  private resolveSignLabel(mesh: Mesh): string {
    const ownName = this.normalizeSignLabel(mesh.name);
    if (ownName) return ownName;
    const parentName = this.normalizeSignLabel(mesh.parent?.name);
    if (parentName) return parentName;
    this.generatedSignCount += 1;
    return `${SIGN_FALLBACK_PREFIX} ${this.generatedSignCount}`;
  }

  private normalizeSignLabel(source: string | undefined): string {
    return (source ?? '')
      .replace(/[._]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async tryLoadQuaderGlb(): Promise<{ scene: Group } | null> {
    const base = import.meta.env.BASE_URL;
    const candidates = [
      `${base}Paasleben.glb`,
      `${base}paasleben.glb`,
      `${base}Quader.glb`,
      `${base}quader.glb`,
      `${base}Quader/Quader.glb`,
      `${base}models/Quader.glb`,
    ];

    for (const path of candidates) {
      try {
        const gltf = await this.gltfLoader.loadAsync(path);
        return { scene: gltf.scene };
      } catch {
        // Try next candidate path.
      }
    }
    return null;
  }

  private createTexturedSign(label: string, widthHint: number): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      return new Mesh(new PlaneGeometry(1, 0.3), new MeshBasicMaterial({ color: '#ffffff' }));
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(255,255,255,0.95)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(25,25,25,0.95)';
    context.lineWidth = 10;
    context.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    context.fillStyle = '#101010';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = 'bold 118px Arial, sans-serif';
    context.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 50);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;

    const planeWidth = Math.min(3, Math.max(0.65, widthHint * 1.25));
    const planeHeight = planeWidth * 0.25;
    const geometry = new PlaneGeometry(planeWidth, planeHeight);
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const sign = new Mesh(geometry, material);
    sign.renderOrder = 12;
    return sign;
  }

  private updateQuaderSignsFacingCamera(): void {
    this.quaderSigns.children.forEach((child) => {
      child.lookAt(this.camera.position.x, child.position.y, this.camera.position.z);
    });
  }

  private clearQuaderOverlay(cancelPendingLoad = true): void {
    if (cancelPendingLoad) {
      this.quaderLoadVersion++;
    }
    this.quaderSigns.children.forEach((child) => {
      const mesh = child as Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          const maybeMap = (entry as MeshBasicMaterial).map;
          if (maybeMap) maybeMap.dispose();
          entry.dispose();
        });
      } else if (material) {
        const maybeMap = (material as MeshBasicMaterial).map;
        if (maybeMap) maybeMap.dispose();
        material.dispose();
      }
    });
    this.quaderSigns.clear();
    if (this.quaderRoot) {
      this.scene.remove(this.quaderRoot);
      this.quaderRoot = null;
    }
  }

  private updateDropInViewer(): void {
    if (!this.dropInViewer) return;
    this.dropInViewer.viewer.update(this.renderer, this.camera);
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
