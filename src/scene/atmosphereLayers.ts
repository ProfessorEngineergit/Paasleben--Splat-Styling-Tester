import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { SceneBounds } from './bounds';
import type { StyleSettings } from '../presets/types';

const hazeVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const hazeFragmentShader = /* glsl */ `
  uniform float time;
  uniform float opacity;
  uniform float speed;
  uniform float scale;
  uniform vec3 color;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amp * noise(p);
      p *= 2.0;
      amp *= 0.55;
    }
    return value;
  }

  void main() {
    vec2 p = vUv * scale + vec2(time * speed, time * speed * 0.3);
    float n = fbm(p * 2.0);
    float band = smoothstep(0.12, 0.9, vUv.y) * smoothstep(0.0, 0.4, n + vUv.y * 0.75);
    float alpha = band * opacity;
    gl_FragColor = vec4(color, alpha);
  }
`;

export class AtmosphereLayers {
  readonly group = new Group();
  private readonly layers: Mesh[] = [];

  constructor() {
    for (let i = 0; i < 4; i++) {
      const material = new ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          opacity: { value: 0.15 },
          speed: { value: 0.02 + i * 0.01 },
          scale: { value: 1.1 + i * 0.3 },
          color: { value: new Color('#ffffff') },
        },
        vertexShader: hazeVertexShader,
        fragmentShader: hazeFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });

      const mesh = new Mesh(new PlaneGeometry(10, 4, 1, 1), material);
      this.layers.push(mesh);
      this.group.add(mesh);
    }
  }

  layout(bounds: SceneBounds): void {
    const radius = Math.max(bounds.radius, 1);
    const baseY = bounds.center.y + bounds.size.y * 0.06;
    const offsets = [
      new Vector3(0, 0, -radius * 1.4),
      new Vector3(0, radius * 0.08, radius * 1.2),
      new Vector3(radius * 1.15, radius * 0.12, 0),
      new Vector3(-radius * 1.2, radius * 0.1, 0),
    ];

    this.layers.forEach((layer, index) => {
      const offset = offsets[index];
      layer.position.set(bounds.center.x + offset.x, baseY + offset.y, bounds.center.z + offset.z);
      layer.scale.set(radius * 2.5, radius * (0.9 + index * 0.2), 1);
    });
  }

  update(settings: StyleSettings, camera: PerspectiveCamera, elapsedSeconds: number): void {
    this.group.visible = settings.showAtmosphereLayers;

    this.layers.forEach((layer, index) => {
      const material = layer.material as ShaderMaterial;
      material.uniforms.time.value = elapsedSeconds;
      material.uniforms.opacity.value = settings.cloudOpacity * (0.4 + index * 0.12);
      material.uniforms.speed.value = settings.cloudSpeed * (0.7 + index * 0.2);
      material.uniforms.scale.value = settings.cloudScale * (1 + index * 0.25);
      material.uniforms.color.value = new Color(settings.highlightTint);

      layer.lookAt(camera.position.x, layer.position.y, camera.position.z);
    });
  }
}
