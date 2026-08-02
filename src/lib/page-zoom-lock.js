// Verhindert ausschließlich den Browser-/Seitenzoom. Interaktive Karten
// dürfen weiterhin ihre eigene Kamera per Rad oder Pinch zoomen; diese
// Gesten werden von deren Canvas-Steuerung verarbeitet.
export const lockPageZoom = () => {
  const stop = (event) => event.preventDefault();

  // Safari liefert Pinch-Gesten zusätzlich als proprietäre gesture*-Events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }

  // Trackpad-Pinch wird in Chromium/Firefox als Ctrl+Wheel gemeldet. Ein
  // normales Rad bleibt unangetastet und kann damit weiterhin die Map zoomen.
  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, { passive: false, capture: true });

  // Desktop-Tastenkürzel für Seitenzoom blockieren (⌘/Ctrl +, -, 0).
  window.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (['+', '=', '-', '_', '0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.key)
      || ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.code)) {
      event.preventDefault();
    }
  }, { capture: true });

  // Verhindert Doppelklick-/Doppeltipp-Seitenzoom. Die Website verwendet
  // keinen Doppelklick als eigene Aktion.
  document.addEventListener('dblclick', stop, { passive: false, capture: true });
};
