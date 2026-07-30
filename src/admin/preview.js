// End-Ansicht: die echte Website in einem iframe (?ort=NN&edit=1).
// Titel, Untertitel und Text sind dort direkt anklick- und editierbar;
// der Viewer schickt Änderungen per postMessage hierher, wir speichern.
export const setupPreview = ({ onEdit }) => {
  const overlay = document.querySelector('#preview-overlay');
  const frame = document.querySelector('#preview-frame');
  const titleEl = document.querySelector('#preview-title');
  let currentId = null;
  let currentDisplay = null;

  const buildSrc = () =>
    `${import.meta.env.BASE_URL}?ort=${encodeURIComponent(currentDisplay)}&edit=1&_=${Date.now()}`;

  const open = (loc) => {
    currentId = loc.id;
    currentDisplay = loc.displayNumber;
    titleEl.textContent = `End-Ansicht · ${loc.displayNumber} ${loc.title}`;
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

  document.querySelector('#preview-close').addEventListener('click', close);
  document.querySelector('#preview-reload').addEventListener('click', reload);
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

  return { open, close, reload };
};
