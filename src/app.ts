import { SCENE_SPLAT_PATH } from './config';
import { SplatExperience } from './scene/splatExperience';
import { createControlPanel } from './ui/controlPanel';
import { buildSettingsFromPreset, DEFAULT_PRESET } from './presets/presets';
import { loadMarkerLabels, updateMarkerLabels, type MarkerLabel } from './scene/markerLabels';

const GLB_PATH = `${import.meta.env.BASE_URL}Paasleben.glb`;

export const boot = async (): Promise<void> => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;

  root.innerHTML = `
    <div class="app-shell">
      <div id="viewport">
        <div id="labels"></div>
      </div>
      <div id="status">Lade Splat…</div>
    </div>
  `;

  const viewport = root.querySelector<HTMLDivElement>('#viewport');
  const labelsContainer = root.querySelector<HTMLDivElement>('#labels');
  const status = root.querySelector<HTMLDivElement>('#status');
  if (!viewport || !labelsContainer || !status) return;

  const settings = buildSettingsFromPreset(DEFAULT_PRESET);
  const experience = new SplatExperience(viewport);
  experience.setSettings(settings);

  let markers: MarkerLabel[] = [];

  const panel = createControlPanel({
    settings,
    onPresetChange: (name) => {
      const preset = buildSettingsFromPreset(name);
      Object.assign(settings, preset);
      experience.setSettings(settings);
      panel.refresh();
    },
    onResetToPreset: () => {
      const preset = buildSettingsFromPreset(settings.preset);
      Object.assign(settings, preset);
      experience.setSettings(settings);
      panel.refresh();
    },
    onSettingsChange: () => {
      experience.setSettings(settings);
    },
    onCopySettings: () => {
      void navigator.clipboard?.writeText(JSON.stringify(settings, null, 2));
    },
    onFullscreen: () => {
      if (!document.fullscreenElement) {
        void root.requestFullscreen?.();
      } else {
        void document.exitFullscreen?.();
      }
    },
    onScreenshot: () => {
      experience.renderer.domElement.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'screenshot.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    },
  });

  try {
    await experience.loadSplat(SCENE_SPLAT_PATH, (percent) => {
      status.textContent = `Lade Splat… ${Math.round(percent)}%`;
    });
    status.remove();

    loadMarkerLabels(GLB_PATH, labelsContainer)
      .then((m) => { markers = m; })
      .catch((err) => { console.warn('GLB marker loading failed:', err); });

    experience.start(() => {
      updateMarkerLabels(markers, experience.camera, viewport.clientWidth, viewport.clientHeight);
    });
  } catch (error) {
    status.textContent = `Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`;
  }

  window.addEventListener(
    'beforeunload',
    () => {
      experience.dispose();
      panel.dispose();
    },
    { once: true },
  );
};
