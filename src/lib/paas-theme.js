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
//   • localStorage dient nur als Zwischenspeicher des letzten bekannten
//     Werts, damit beim Laden nichts aufblitzt. Die Wahrheit steht in
//     Firestore.
//
// Bewusst NICHT Teil dieses Moduls: Kamera, Steuerung, Marker, Panel. Das
// Theme wechselt ausschließlich Farben und Schriften.

const THEME_IDS = ['current', 'legacy-brand', 'combined'];
const DEFAULT_THEME = 'current';
const STORAGE_KEY = 'paas-theme';

// Beschriftungen für die Editor-Oberfläche.
export const THEMES = [
  {
    id: 'current',
    label: 'Aktuelles Design',
    hint: 'Der heutige Auftritt: warmes Papier, Schreibmaschinen-Schrift.',
  },
  {
    id: 'legacy-brand',
    label: 'Altes Branding',
    hint: 'Nachbildung von top-executive-events.com: weiß, orange, Oxygen.',
  },
  {
    id: 'combined',
    label: 'Neues kombiniertes Design',
    hint: 'Vorschlag: Kalkstein, gebranntes Siena, Fraunces über Inter.',
  },
];

// Zusätzliche Web-Schriften je Theme. Werden erst geladen, wenn das Theme
// wirklich aktiv wird — so bleibt die Ladezeit des Standard-Themes unberührt.
const THEME_FONTS = {
  'legacy-brand': 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@200;400;500&family=Oxygen:wght@300;400;700&display=swap',
  combined: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@300;400;500;600&display=swap',
};

// Browser-UI-Farbe (Adressleiste auf Mobilgeräten) je Theme.
const THEME_META_COLOR = {
  current: '#f4ecd8',
  'legacy-brand': '#ffffff',
  combined: '#f7f4ee',
};

export const isTheme = (value) => THEME_IDS.includes(value);

const ensureFont = (theme) => {
  const href = THEME_FONTS[theme];
  if (!href || document.querySelector(`link[data-paas-font="${theme}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.paasFont = theme;
  document.head.appendChild(link);
};

/** Setzt das Theme sofort und meldet den Wechsel per `paas:themechange`. */
export const applyTheme = (theme) => {
  const next = isTheme(theme) ? theme : DEFAULT_THEME;
  ensureFont(next);
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && THEME_META_COLOR[next]) meta.setAttribute('content', THEME_META_COLOR[next]);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Privater Modus o. Ä. — dann fehlt nur der Zwischenspeicher.
  }
  window.dispatchEvent(new CustomEvent('paas:themechange', { detail: { theme: next } }));
  return next;
};

export const cachedTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // ignorieren
  }
  return DEFAULT_THEME;
};

/**
 * Wendet zuerst den zwischengespeicherten Wert an (kein Aufblitzen) und holt
 * danach den verbindlichen Wert aus Firestore. Firestore wird dynamisch
 * importiert, damit das Modul auch ohne Verbindung nutzbar bleibt und der
 * Import die erste Anzeige nicht aufhält.
 */
export const initTheme = async () => {
  applyTheme(cachedTheme());
  try {
    const [{ doc, getDoc }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('./firebase.js'),
    ]);
    const snap = await getDoc(doc(db, 'paas_config', 'site'));
    const remote = snap.exists() ? snap.data()?.theme : null;
    if (isTheme(remote) && remote !== document.documentElement.dataset.theme) {
      applyTheme(remote);
    }
    return document.documentElement.dataset.theme;
  } catch (err) {
    // Ohne Verbindung bleibt der zwischengespeicherte Wert stehen — die Seite
    // ist damit vollständig benutzbar, nur eben eventuell nicht im zuletzt im
    // Editor gewählten Theme.
    console.warn('Theme konnte nicht aus Firestore geladen werden:', err);
    return document.documentElement.dataset.theme;
  }
};
