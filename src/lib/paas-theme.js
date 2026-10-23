// Laufzeit-Themes für Website und Editor.
//
// Wie es zusammenspielt:
//   • Die Farb- und Schrift-Token liegen als CSS-Variablen in
//     src/styles/themes/*.css, jeweils unter :root[data-theme='…'] gescoped.
//     Alle drei Dateien sind immer im Bundle — umgeschaltet wird nur das
//     Attribut auf <html>, es wird kein Stylesheet nachgeladen.
//   • Welches Theme gilt, entscheidet ein einzelnes Firestore-Dokument
//     (paas_config/site, Feld `theme`). Damit wirkt die Auswahl im Editor
//     sofort für alle Besucher, ohne Deploy.
//   • Im Browser wird bewusst nichts zwischengespeichert (kein localStorage,
//     DSGVO/TDDDG). Bis Firestore antwortet, gilt das Standard-Theme; das ist
//     zugleich das gewählte, ein Aufblitzen gibt es also praktisch nie.
//   • Alle Schriften liegen lokal im Bundle (src/styles/fonts.css), es geht
//     keine Anfrage an Google Fonts.
//
// Bewusst NICHT Teil dieses Moduls: Kamera, Steuerung, Marker, Panel. Das
// Theme wechselt ausschließlich Farben und Schriften.

import { readDoc } from './firestore-rest.js';

// Das Design der Website ist der Auftritt von Top Executive Events
// (legacy-brand). Das ursprüngliche Papier-Design bleibt als Rückfallebene
// im Editor wählbar; der zwischenzeitliche kombinierte Entwurf ist entfernt.
const THEME_IDS = ['legacy-brand', 'current'];
const DEFAULT_THEME = 'legacy-brand';

// Beschriftungen für die Editor-Oberfläche.
export const THEMES = [
  {
    id: 'legacy-brand',
    label: 'Top Executive Events',
    hint: 'Der Auftritt von top-executive-events.com: weiß, orange, Oxygen.',
  },
  {
    id: 'current',
    label: 'Ursprüngliches Design',
    hint: 'Das frühere Papier-Design mit Schreibmaschinen-Schrift.',
  },
];

// Browser-UI-Farbe (Adressleiste auf Mobilgeräten) je Theme.
const THEME_META_COLOR = {
  current: '#f4ecd8',
  'legacy-brand': '#ffffff',
};

export const isTheme = (value) => THEME_IDS.includes(value);

/** Setzt das Theme sofort und meldet den Wechsel per `paas:themechange`. */
export const applyTheme = (theme) => {
  const next = isTheme(theme) ? theme : DEFAULT_THEME;
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && THEME_META_COLOR[next]) meta.setAttribute('content', THEME_META_COLOR[next]);
  window.dispatchEvent(new CustomEvent('paas:themechange', { detail: { theme: next } }));
  return next;
};

export const cachedTheme = () => {
  const current = document.documentElement.dataset.theme;
  return isTheme(current) ? current : DEFAULT_THEME;
};

/**
 * Wendet sofort das Standard-Theme an und holt danach den verbindlichen Wert
 * aus Firestore (REST, ohne SDK).
 */
export const initTheme = async () => {
  applyTheme(cachedTheme());
  try {
    const site = await readDoc('paas_config/site');
    const remote = site?.theme;
    if (isTheme(remote) && remote !== document.documentElement.dataset.theme) {
      applyTheme(remote);
    }
    return document.documentElement.dataset.theme;
  } catch (err) {
    // Ohne Verbindung bleibt das Standard-Theme stehen — die Seite ist damit
    // vollständig benutzbar, nur eben eventuell nicht im Editor-Theme.
    console.warn('Theme konnte nicht aus Firestore geladen werden:', err);
    return document.documentElement.dataset.theme;
  }
};
