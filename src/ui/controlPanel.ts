import GUI from 'lil-gui';
import { PRESET_NAMES } from '../presets/presets';
import type { StyleSettings } from '../presets/types';

type ControlPanelOptions = {
  settings: StyleSettings;
  onPresetChange: (name: string) => void;
  onResetToPreset: () => void;
  onCopySettings: () => void;
  onFullscreen: () => void;
  onScreenshot: () => void;
};

export type ControlPanel = {
  refresh: () => void;
  dispose: () => void;
};

export const createControlPanel = (options: ControlPanelOptions): ControlPanel => {
  const gui = new GUI({ title: 'Style Lab' });
  gui.close();

  const general = gui.addFolder('Allgemein');
  general.add(options.settings, 'preset', PRESET_NAMES).name('Preset').onChange((value: string) => {
    options.onPresetChange(value);
  });
  general.add(options.settings, 'autoRotate').name('Auto-Rotate');
  general.add({ reset: options.onResetToPreset }, 'reset').name('Reset to preset');
  general.add({ screenshot: options.onScreenshot }, 'screenshot').name('Screenshot');
  general.add({ copy: options.onCopySettings }, 'copy').name('Copy settings JSON');
  general.add({ fullscreen: options.onFullscreen }, 'fullscreen').name('Fullscreen');

  const camera = gui.addFolder('Kamera');
  camera.add(options.settings, 'fov', 25, 95, 1).name('FOV');
  camera.add(options.settings, 'minDistance', 0.2, 20, 0.1).name('Min Dist');
  camera.add(options.settings, 'maxDistance', 2, 80, 0.5).name('Max Dist');
  camera.add(options.settings, 'autoRotateSpeed', -5, 5, 0.01).name('Rotate Speed');

  const splat = gui.addFolder('Splat-Look');
  splat.add(options.settings, 'splatScale', 0.5, 2.2, 0.01).name('Splat Size');
  splat.add(options.settings, 'opacity', 0.05, 1, 0.01).name('Opacity');
  splat.add(options.settings, 'contrast', 0.2, 2.5, 0.01).name('Contrast');
  splat.add(options.settings, 'brightness', 0.3, 1.8, 0.01).name('Brightness');
  splat.add(options.settings, 'gamma', 0.4, 2.5, 0.01).name('Gamma');
  splat.add(options.settings, 'saturation', 0, 2, 0.01).name('Saturation');
  splat.add(options.settings, 'monochrome').name('Monochrome');
  splat.add(options.settings, 'invert').name('Invert');
  splat.add(options.settings, 'posterize', 0, 1, 0.01).name('Posterize');

  const atmosphere = gui.addFolder('Atmosphäre');
  atmosphere.add(options.settings, 'fogDensity', 0, 1, 0.01).name('Fog Density');
  atmosphere.add(options.settings, 'fogNear', 0, 2, 0.01).name('Fog Near');
  atmosphere.add(options.settings, 'fogFar', 0.1, 2.5, 0.01).name('Fog Far');
  atmosphere.add(options.settings, 'edgeFadeStrength', 0, 1, 0.01).name('Edge Fade');
  atmosphere.add(options.settings, 'edgeFadeDistance', 0.2, 1.4, 0.01).name('Edge Dist');
  atmosphere.add(options.settings, 'horizonHaze', 0, 1, 0.01).name('Horizon Haze');
  atmosphere.add(options.settings, 'cloudOpacity', 0, 1, 0.01).name('Cloud Opacity');
  atmosphere.add(options.settings, 'cloudSpeed', 0, 0.2, 0.001).name('Cloud Speed');
  atmosphere.add(options.settings, 'cloudScale', 0.3, 4, 0.01).name('Cloud Scale');
  atmosphere.add(options.settings, 'showAtmosphereLayers').name('Show Layers');

  const composition = gui.addFolder('Komposition');
  composition.addColor(options.settings, 'backgroundColor').name('BG Color');
  composition.addColor(options.settings, 'highlightTint').name('Highlight');
  composition.addColor(options.settings, 'shadowTint').name('Shadow');
  composition.add(options.settings, 'vignetteStrength', 0, 1, 0.01).name('Vignette');
  composition.add(options.settings, 'grainStrength', 0, 0.25, 0.001).name('Grain');
  composition.add(options.settings, 'bloomStrength', 0, 1, 0.01).name('Bloom');

  const refresh = (): void => {
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };

  return {
    refresh,
    dispose: () => gui.destroy(),
  };
};
