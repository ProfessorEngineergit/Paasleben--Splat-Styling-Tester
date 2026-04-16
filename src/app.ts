import { SCENE_SPLAT_PATH } from './config';
import { buildSettingsFromPreset, DEFAULT_PRESET, PRESETS } from './presets/presets';
import type { StyleSettings } from './presets/types';
import { SplatExperience } from './scene/splatExperience';
import { createControlPanel } from './ui/controlPanel';

const ensurePreset = (name: string | null): string => {
  if (!name || !PRESETS[name]) return DEFAULT_PRESET;
  return name;
};

const updatePresetURL = (preset: string): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('preset', preset);
  window.history.replaceState({}, '', url);
};

const syncSettingsFromPreset = (settings: StyleSettings, presetName: string): void => {
  const next = buildSettingsFromPreset(presetName);
  Object.assign(settings, next);
};

const createIntroOverlay = (): HTMLDivElement => {
  const overlay = document.createElement('div');
  overlay.className = 'intro-overlay';
  overlay.innerHTML = `
    <div class="intro-card">
      <h1>Splat Styling Lab</h1>
      <p>Orbit mit Maus, Zoom mit Wheel, Presets im Panel oben rechts.</p>
      <button type="button">Start</button>
    </div>
  `;
  overlay.querySelector('button')?.addEventListener('click', () => {
    overlay.classList.add('hidden');
  });
  return overlay;
};

const createLoadingOverlay = (): {
  element: HTMLDivElement;
  setProgress: (value: number) => void;
  hide: () => void;
} => {
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.innerHTML = `
    <div class="loading-card">
      <div class="loading-text">Lade Splat…</div>
      <div class="loading-track">
        <div class="loading-fill"></div>
      </div>
      <div class="loading-percent">0%</div>
    </div>
  `;

  const fill = overlay.querySelector<HTMLDivElement>('.loading-fill');
  const percent = overlay.querySelector<HTMLDivElement>('.loading-percent');

  const setProgress = (value: number): void => {
    const clamped = Math.round(Math.max(0, Math.min(100, value)));
    if (fill) fill.style.width = `${clamped}%`;
    if (percent) percent.textContent = `${clamped}%`;
  };

  return {
    element: overlay,
    setProgress,
    hide: () => {
      overlay.classList.add('hidden');
      window.setTimeout(() => overlay.remove(), 240);
    },
  };
};

export const boot = async (): Promise<void> => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;

  root.innerHTML = `
    <div class="app-shell">
      <div id="viewport"></div>
    </div>
  `;

  const viewport = root.querySelector<HTMLDivElement>('#viewport');
  if (!viewport) return;

  const initialPreset = ensurePreset(new URL(window.location.href).searchParams.get('preset'));
  const settings = buildSettingsFromPreset(initialPreset);

  const loading = createLoadingOverlay();
  document.body.appendChild(loading.element);

  const experience = new SplatExperience(viewport);
  await experience.loadSplat(SCENE_SPLAT_PATH, loading.setProgress);
  loading.setProgress(100);
  loading.hide();

  const panel = createControlPanel({
    settings,
    onPresetChange: (presetName) => {
      syncSettingsFromPreset(settings, presetName);
      updatePresetURL(presetName);
      panel.refresh();
    },
    onResetToPreset: () => {
      syncSettingsFromPreset(settings, settings.preset);
      panel.refresh();
    },
    onCopySettings: async () => {
      await navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
    },
    onFullscreen: () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    },
    onScreenshot: () => {
      experience.screenshot();
    },
  });

  document.body.appendChild(createIntroOverlay());

  experience.start(() => settings);

  window.addEventListener('beforeunload', () => {
    panel.dispose();
    experience.dispose();
  });
};
