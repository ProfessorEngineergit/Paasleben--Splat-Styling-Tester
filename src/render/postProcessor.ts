import { Color, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SceneBounds } from '../scene/bounds';
import type { StyleSettings } from '../presets/types';
import { createAtmosphereShader } from '../shaders/atmosphereShader';
import { createStyleShader } from '../shaders/styleShader';

const tempCenter = new Vector3();
const tempRight = new Vector3();
const tempEdge = new Vector3();
const tempNdc = new Vector3();

export class PostProcessor {
  readonly composer: EffectComposer;
  private readonly stylePass: ShaderPass;
  private readonly atmospherePass: ShaderPass;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.stylePass = new ShaderPass(createStyleShader());
    this.atmospherePass = new ShaderPass(createAtmosphereShader());

    this.composer.addPass(this.stylePass);
    this.composer.addPass(this.atmospherePass);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  update(settings: StyleSettings, bounds: SceneBounds | null, camera: PerspectiveCamera, elapsedSeconds: number): void {
    this.stylePass.uniforms.brightness.value = settings.brightness;
    this.stylePass.uniforms.contrast.value = settings.contrast;
    this.stylePass.uniforms.gamma.value = settings.gamma;
    this.stylePass.uniforms.saturation.value = settings.saturation;
    this.stylePass.uniforms.monochrome.value = settings.monochrome ? 1 : 0;
    this.stylePass.uniforms.invert.value = settings.invert ? 1 : 0;
    this.stylePass.uniforms.opacity.value = settings.opacity;
    this.stylePass.uniforms.posterize.value = settings.posterize;
    this.stylePass.uniforms.highlightTint.value = new Color(settings.highlightTint);
    this.stylePass.uniforms.shadowTint.value = new Color(settings.shadowTint);

    this.atmospherePass.uniforms.time.value = elapsedSeconds;
    this.atmospherePass.uniforms.fogDensity.value = settings.fogDensity;
    this.atmospherePass.uniforms.fogNear.value = settings.fogNear;
    this.atmospherePass.uniforms.fogFar.value = settings.fogFar;
    this.atmospherePass.uniforms.edgeFadeStrength.value = settings.edgeFadeStrength;
    this.atmospherePass.uniforms.edgeFadeDistance.value = settings.edgeFadeDistance;
    this.atmospherePass.uniforms.horizonHaze.value = settings.horizonHaze;
    this.atmospherePass.uniforms.cloudOpacity.value = settings.cloudOpacity;
    this.atmospherePass.uniforms.cloudSpeed.value = settings.cloudSpeed;
    this.atmospherePass.uniforms.cloudScale.value = settings.cloudScale;
    this.atmospherePass.uniforms.vignetteStrength.value = settings.vignetteStrength;
    this.atmospherePass.uniforms.grainStrength.value = settings.grainStrength;
    this.atmospherePass.uniforms.bloomStrength.value = settings.bloomStrength;
    this.atmospherePass.uniforms.backgroundColor.value = new Color(settings.backgroundColor);

    if (!bounds) {
      this.atmospherePass.uniforms.boundsCenter.value = new Vector2(0.5, 0.5);
      this.atmospherePass.uniforms.boundsRadius.value = 0.35;
      return;
    }

    tempCenter.copy(bounds.center).project(camera);
    tempRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    tempEdge.copy(bounds.center).addScaledVector(tempRight, bounds.radius).project(camera);

    const centerUV = new Vector2(tempCenter.x * 0.5 + 0.5, tempCenter.y * 0.5 + 0.5);
    const radiusUV = Math.max(
      0.08,
      Math.hypot(tempEdge.x - tempCenter.x, tempEdge.y - tempCenter.y) * 0.5,
    );

    if (!Number.isFinite(radiusUV)) {
      this.atmospherePass.uniforms.boundsCenter.value = new Vector2(0.5, 0.5);
      this.atmospherePass.uniforms.boundsRadius.value = 0.35;
      return;
    }

    tempNdc.set(tempCenter.x, tempCenter.y, tempCenter.z);
    if (tempNdc.z < -1 || tempNdc.z > 1) {
      this.atmospherePass.uniforms.boundsCenter.value = new Vector2(0.5, 0.5);
      this.atmospherePass.uniforms.boundsRadius.value = 0.35;
      return;
    }

    this.atmospherePass.uniforms.boundsCenter.value = centerUV;
    this.atmospherePass.uniforms.boundsRadius.value = radiusUV;
  }

  render(): void {
    this.composer.render();
  }
}
