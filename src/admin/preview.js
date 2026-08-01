// End-Ansicht: die echte Website in einem iframe (?ort=NN&edit=1).
// Titel, Untertitel und Text sind dort direkt anklick- und editierbar;
// der Viewer schickt Änderungen per postMessage hierher, wir speichern.
export const setupPreview = ({ onEdit }) => {
  const overlay = document.querySelector('#preview-overlay');
  const frame = document.querySelector('#preview-frame');
  const titleEl = document.querySelector('#preview-title');
  const stage = document.querySelector('#preview-stage');
  const viewport = document.querySelector('.editor-viewport');
  const deviceLabel = document.querySelector('#preview-device-label');
  const deviceButtons = [...document.querySelectorAll('[data-preview-device]')];
  let currentId = null;
  let currentDisplay = null;

  const buildSrc = () =>
    `${import.meta.env.BASE_URL}?ort=${encodeURIComponent(currentDisplay)}&edit=1&_=${Date.now()}`;

  // Am Desktop ersetzt die End-Ansicht nur die 3D-Karte. Die vollständige
  // Editing-Suite samt Sidebar bleibt daneben sichtbar und bedienbar; auf
  // schmalen Geräten übernimmt die CSS-Media-Query weiterhin den Vollbildmodus.
  const placeOverViewport = () => {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    overlay.style.setProperty('--preview-left', `${rect.left}px`);
    overlay.style.setProperty('--preview-top', `${rect.top}px`);
    overlay.style.setProperty('--preview-width', `${rect.width}px`);
    overlay.style.setProperty('--preview-height', `${rect.height}px`);
  };

  const open = (loc) => {
    currentId = loc.id;
    currentDisplay = loc.displayNumber;
    titleEl.textContent = `End-Ansicht · ${loc.displayNumber} ${loc.title}`;
    placeOverViewport();
    frame.src = buildSrc();
    overlay.hidden = false;
  };

  const close = () => {
    overlay.hidden = true;
    frame.src = 'about:blank';
    currentId = null;
  };

  // Neu laden, falls die Vorschau offen ist — etwa nach einem Design-Wechsel,
  // damit die End-Ansicht das neue Theme sofort zeigt.
  const reload = () => {
    if (currentId && !overlay.hidden) frame.src = buildSrc();
  };

  const setDevice = (device) => {
    const value = device === 'mobile' ? 'mobile' : 'desktop';
    stage.dataset.device = value;
    deviceLabel.textContent = value === 'mobile'
      ? 'Mobile Website · bearbeitbare Vorschau'
      : 'Desktop-Website · bearbeitbare Vorschau';
    deviceButtons.forEach((button) => {
      const active = button.dataset.previewDevice === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  document.querySelector('#preview-close').addEventListener('click', close);
  document.querySelector('#preview-reload').addEventListener('click', reload);
  deviceButtons.forEach((button) => button.addEventListener('click', () => setDevice(button.dataset.previewDevice)));
  window.addEventListener('resize', placeOverViewport, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    const msg = e.data;
    if (!msg || msg.type !== 'paas-edit' || !msg.id || typeof msg.field !== 'string') return;
    if (!['title', 'subtitle', 'body'].includes(msg.field)) return;
    onEdit(msg.id, { [msg.field]: String(msg.value ?? '') });
  });

  return { open, close, reload, setDevice };
};
