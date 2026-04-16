import { SCENE_SPLAT_PATH } from './config';
import { SplatExperience } from './scene/splatExperience';

export const boot = async (): Promise<void> => {
  const root = document.querySelector<HTMLDivElement>('#app');
  if (!root) return;

  root.innerHTML = `
    <div class="app-shell">
      <div id="viewport"></div>
      <div id="status">Lade Splat…</div>
    </div>
  `;

  const viewport = root.querySelector<HTMLDivElement>('#viewport');
  const status = root.querySelector<HTMLDivElement>('#status');
  if (!viewport || !status) return;

  const experience = new SplatExperience(viewport);
  try {
    await experience.loadSplat(SCENE_SPLAT_PATH, (percent) => {
      status.textContent = `Lade Splat… ${Math.round(percent)}%`;
    });
    status.remove();
    experience.start();
  } catch (error) {
    status.textContent = `Fehler beim Laden: ${error instanceof Error ? error.message : 'Unbekannt'}`;
  }

  window.addEventListener(
    'beforeunload',
    () => {
      experience.dispose();
    },
    { once: true },
  );
};
