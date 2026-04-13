export type RgbColor = { r: number; g: number; b: number };

export type StyleSettings = {
  preset: string;
  autoRotate: boolean;
  fov: number;
  minDistance: number;
  maxDistance: number;
  autoRotateSpeed: number;
  splatScale: number;
  opacity: number;
  contrast: number;
  brightness: number;
  gamma: number;
  saturation: number;
  monochrome: boolean;
  invert: boolean;
  fogDensity: number;
  fogNear: number;
  fogFar: number;
  edgeFadeStrength: number;
  edgeFadeDistance: number;
  horizonHaze: number;
  cloudOpacity: number;
  cloudSpeed: number;
  cloudScale: number;
  backgroundColor: string;
  highlightTint: string;
  shadowTint: string;
  vignetteStrength: number;
  grainStrength: number;
  bloomStrength: number;
  showAtmosphereLayers: boolean;
  posterize: number;
};

export type StylePreset = {
  name: string;
  values: Omit<StyleSettings, 'preset'>;
};
