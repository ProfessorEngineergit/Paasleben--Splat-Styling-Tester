// Zweisprachige Website (Deutsch/Englisch).
//
// Sprachwahl: `?lang=en` bzw. `?lang=de` in der Adresse; ohne Angabe die
// Browsersprache (englisch, wenn sie mit „en" beginnt, sonst deutsch).
// Gespeichert wird nichts im Browser (kein localStorage/Cookie, DSGVO) — die
// Wahl lebt in der URL, der Umschalter lädt die Seite mit dem neuen Parameter.
//
// Textquellen für Englisch, in dieser Reihenfolge:
//   1. im Editor eingetragener englischer Text (Firestore-Felder `*_en`)
//   2. Standardtext aus src/lib/translations-en.js
//   3. der deutsche Text
import {
  EN_LOCATIONS, EN_SITE, EN_IMPRESSUM_HTML, EN_DATENSCHUTZ_HTML,
} from './translations-en.js';

export const LANGS = ['de', 'en'];

const detect = () => {
  const params = new URLSearchParams(location.search);
  // Die bearbeitbare Vorschau im Editor zeigt immer den deutschen Originaltext.
  if (params.get('edit') === '1') return 'de';
  const param = params.get('lang');
  if (LANGS.includes(param)) return param;
  return /^en\b/i.test(navigator.language || '') ? 'en' : 'de';
};

export const LANG = detect();
export const isEnglish = () => LANG === 'en';

// Lädt die Seite in der anderen Sprache neu (alle übrigen Parameter bleiben).
export const switchLang = (next = LANG === 'en' ? 'de' : 'en') => {
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  location.href = url.toString();
};

// Oberflächentexte. Schlüssel = deutscher Ausgangstext in index.html bzw.
// paas-panel.js; Englisch steht hier, Deutsch ist der Fallback.
const UI = {
  en: {
    'Ton': 'Sound',
    'Draufsicht': 'Top view',
    'Bedienung': 'Help',
    'Kontakt': 'Contact',
    'Impressum': 'Legal notice',
    'Datenschutz': 'Privacy',
    '× SCHLIESSEN': '× CLOSE',
    '← ZURÜCK ZUR KARTE': '← BACK TO MAP',
    'STANDPUNKT': 'STOP',
    'KAPITEL': 'CHAPTER',
    'CHARAKTER': 'CHARACTER',
    'ORT': 'PLACE',
    'PAASLEBEN · GARTEN': 'PAASLEBEN · GROUNDS',
    'Film folgt in Kürze': 'Film coming soon',
    'Anfragen & Kontakt': 'Enquiries & contact',
    'Die Gastgeber': 'Your hosts',
    'Standpunkte': 'Places',
    'Rechtliches': 'Legal',
    'Ton einschalten': 'Turn sound on',
    'Ton ausschalten': 'Turn sound off',
    'Draufsicht auf das Areal': 'Top view of the grounds',
    'Bedienung & Tastenkürzel': 'Help & keyboard shortcuts',
    'Schließen': 'Close',
    'Zurück zu': 'Back to',
    'Weiter zu': 'Next:',
    'ansehen': 'view',
    'Karte ziehen': 'Drag the map',
    'zum Bewegen': 'to move around',
    'Schild antippen': 'Tap a sign',
    'Standpunkt öffnen': 'to open a place',
    'Hochwischen / Scrollen': 'Swipe up / scroll',
    'Text lesen': 'to read the text',
    'Tippen oben': 'Tap at the top',
    'Direkt zu Standpunkt': 'Jump to place',
    'Wechseln': 'Switch',
    'Heim': 'Home',
    'Über Paasleben': 'About Paasleben',
    'Tastatur': 'Keyboard',
    'TIPPEN ZUM ÜBERSPRINGEN': 'TAP TO SKIP',
    '[ESC] ÜBERSPRINGEN': '[ESC] SKIP',
    'SZENE WIRD GELADEN': 'LOADING SCENE',
    'Ein Ort zum Atmen. Ein Ort für Skulpturen.': 'A place to breathe. A place for sculpture.',
    // Ergänzt für die Sprachumschaltung der Besucheransicht
    'Ein Ort zum Atmen.\nEin Ort für Skulpturen.\nEin Ort für Tiere.': 'A place to breathe.\nA place for sculpture.\nA place for animals.',
    'Hilfe-Einleitung': 'A retreat by Maren & Til Paas. Explore the studio, the garden and the house — tap a sign to open its story.',
    'Nr.': 'No.',
    'öffnen': 'open',
    'Ton an': 'Sound on',
    'SCHLIESSEN': 'CLOSE',
    'BILD': 'IMAGE',
    'Porträt': 'Portrait',
    'Schließen — auf den oberen Bereich tippen': 'Close — tap the top area',
    'PAASLEBEN · KAPITEL EINS': 'PAASLEBEN · CHAPTER ONE',
    'vorbereiten': 'preparing',
    'Szene · Splat': 'Scene · Splat',
    'Standpunkte · Modell': 'Places · Model',
    'Vorheriger Standpunkt': 'Previous place',
    'Nächster Standpunkt': 'Next place',
    'Zurück': 'Back',
    'Weiter': 'Next',
    'Orte auf dem Areal': 'Places on the grounds',
    'Zwischen geöffneten Standpunkten wechseln': 'Switch between open places',
    'Kontakt und Rechtliches': 'Contact and legal',
    'Datenschutzerklärung': 'Privacy policy',
  },
};

/** Oberflächentext in der aktuellen Sprache (Fallback: der deutsche Schlüssel). */
export const t = (key) => (LANG === 'en' ? UI.en[key] ?? key : key);

/** Englischer Standardtext bzw. deutscher Text, je nach Sprache. */
export const pickText = (german, englishEntered, englishDefault) => {
  if (LANG !== 'en') return german;
  return (englishEntered && String(englishEntered).trim())
    || (englishDefault && String(englishDefault).trim())
    || german;
};

/** Ort in der aktuellen Sprache: { title, subtitle, body, imageAlt(url, german) }. */
export const localizeLocation = (loc) => {
  const en = EN_LOCATIONS[loc.id] || {};
  return {
    title: pickText(loc.title, loc.title_en, en.title),
    subtitle: pickText(loc.subtitle, loc.subtitle_en, en.subtitle),
    body: pickText(loc.body, loc.body_en, en.body),
    imageAlt: (url, german) => pickText(german, '', en.alts?.[url]),
  };
};

/** Website-Texte (paas_config/content) in der aktuellen Sprache. */
export const localizeSite = (content) => {
  if (LANG !== 'en') return content;
  const out = { ...content };
  for (const key of ['eyebrow', 'mainTitle', 'tagline', 'lede', 'ledeSub', 'hostsHeading']) {
    out[key] = pickText(content[key], content[`${key}_en`], EN_SITE[key]);
  }
  out.hosts = (content.hosts || []).map((host, i) => ({
    ...host,
    role: pickText(host.role, host.role_en, EN_SITE.hosts?.[i]?.role),
    text: pickText(host.text, host.text_en, EN_SITE.hosts?.[i]?.text),
  }));
  return out;
};

/** Englische Standardtexte der Rechtsseiten (Fallback in src/lib/legal.js). */
export const EN_LEGAL_DEFAULTS = {
  impressum: EN_IMPRESSUM_HTML,
  datenschutz: EN_DATENSCHUTZ_HTML,
};
