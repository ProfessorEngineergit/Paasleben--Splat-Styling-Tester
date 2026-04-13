import { Color, Vector2 } from 'three';

export const createAtmosphereShader = () => ({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    fogDensity: { value: 0.25 },
    fogNear: { value: 0.4 },
    fogFar: { value: 1.3 },
    edgeFadeStrength: { value: 0.5 },
    edgeFadeDistance: { value: 0.75 },
    horizonHaze: { value: 0.2 },
    cloudOpacity: { value: 0.2 },
    cloudSpeed: { value: 0.03 },
    cloudScale: { value: 1.2 },
    vignetteStrength: { value: 0.2 },
    grainStrength: { value: 0.04 },
    bloomStrength: { value: 0.1 },
    backgroundColor: { value: new Color('#eeeeee') },
    boundsCenter: { value: new Vector2(0.5, 0.5) },
    boundsRadius: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float fogDensity;
    uniform float fogNear;
    uniform float fogFar;
    uniform float edgeFadeStrength;
    uniform float edgeFadeDistance;
    uniform float horizonHaze;
    uniform float cloudOpacity;
    uniform float cloudSpeed;
    uniform float cloudScale;
    uniform float vignetteStrength;
    uniform float grainStrength;
    uniform float bloomStrength;
    uniform vec3 backgroundColor;
    uniform vec2 boundsCenter;
    uniform float boundsRadius;
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
        amp *= 0.5;
      }
      return value;
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      float distNorm = distance(vUv, boundsCenter) / max(boundsRadius, 0.001);
      float fog = smoothstep(fogNear, fogFar, distNorm) * fogDensity;
      float edgeMask = smoothstep(edgeFadeDistance, 1.45, distNorm) * edgeFadeStrength;

      float horizon = smoothstep(0.15, 0.9, 1.0 - abs(vUv.y - 0.5) * 1.5) * horizonHaze;

      vec2 cloudUV = vUv * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.3);
      float cloud = fbm(cloudUV * 2.2);
      cloud = smoothstep(0.45, 0.78, cloud) * cloudOpacity;

      vec3 bloomed = color + color * bloomStrength * 0.4;
      color = mix(bloomed, backgroundColor, clamp(fog + edgeMask + horizon * 0.45, 0.0, 1.0));
      color = mix(color, backgroundColor, cloud * 0.45);

      float grain = hash(vUv * vec2(1920.0, 1080.0) + time * 17.0) - 0.5;
      color += grain * grainStrength;

      float vignette = smoothstep(0.05, 1.2, distance(vUv, vec2(0.5)));
      color = mix(color, color * (1.0 - vignetteStrength), vignette);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
    }
  `,
});
