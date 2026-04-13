import { Color } from 'three';

export const createStyleShader = () => ({
  uniforms: {
    tDiffuse: { value: null },
    brightness: { value: 1 },
    contrast: { value: 1 },
    gamma: { value: 1 },
    saturation: { value: 1 },
    monochrome: { value: 0 },
    invert: { value: 0 },
    opacity: { value: 1 },
    highlightTint: { value: new Color('#ffffff') },
    shadowTint: { value: new Color('#000000') },
    posterize: { value: 0 },
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
    uniform float brightness;
    uniform float contrast;
    uniform float gamma;
    uniform float saturation;
    uniform float monochrome;
    uniform float invert;
    uniform float opacity;
    uniform vec3 highlightTint;
    uniform vec3 shadowTint;
    uniform float posterize;
    varying vec2 vUv;

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = max(base.rgb, vec3(0.0));

      color = pow(color, vec3(1.0 / max(gamma, 0.001)));
      color = (color - 0.5) * contrast + 0.5;
      color += vec3(brightness - 1.0);

      float luminance = luma(color);
      color = mix(vec3(luminance), color, saturation);
      color = mix(color, vec3(luma(color)), monochrome);

      float tonal = smoothstep(0.15, 0.85, luma(color));
      color = mix(color * shadowTint, color * highlightTint, tonal);

      if (posterize > 0.001) {
        float levels = mix(64.0, 4.0, clamp(posterize, 0.0, 1.0));
        color = floor(color * levels) / levels;
      }

      color = mix(color, vec3(1.0) - color, invert);
      color = clamp(color, 0.0, 1.0);

      gl_FragColor = vec4(color, base.a * opacity);
    }
  `,
});
