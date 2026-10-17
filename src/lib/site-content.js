// Seitenweite Texte, die nicht zu einem einzelnen Ort gehören: Kopfbereich
// oben links und die Gastgeber-Profile (samt Kontaktdaten). Liegt in Firestore
// (`paas_config/content`) und wird im Editor unter „Website-Texte" gepflegt.
// Die Werte hier sind Startwerte und Fallback ohne Verbindung.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

const CONTENT_DOC = ['paas_config', 'content'];

// Reihenfolge = Reihenfolge im Kopfbereich der Website.
export const HEADER_FIELDS = [
  { key: 'eyebrow', label: 'Kleine Zeile über dem Titel', hint: 'Versalien, ganz oben links' },
  { key: 'mainTitle', label: 'Haupttitel', hint: 'Der große Schriftzug' },
  { key: 'tagline', label: 'Zeile unter dem Titel', hint: 'Direkt unter dem Haupttitel' },
  { key: 'lede', label: 'Einleitung', hint: 'Unter der Trennlinie' },
  { key: 'ledeSub', label: 'Hinweis', hint: 'Kleiner, grauer Text darunter' },
];

export const DEFAULT_SITE_CONTENT = {
  eyebrow: 'MAREN & TIL PAAS',
  mainTitle: 'Paasleben',
  tagline: 'Coaching Campus & Country Club',
  lede: 'Tier- und Skulpturenpark.',
  ledeSub: 'Lofts, Areal, Pferde — klick die Schilder, lies die Geschichten.',
  hostsHeading: 'Die Gastgeber',
  hosts: [
    {
      name: 'Maren Paas',
      photo: 'images/gastgeber/maren-paas.jpg',
      text: 'Maren Paas ist seit über 33 Jahren Beraterin internationaler Führungskräfte (mehr als 30 Jahre Egon Zehnder) und ausgebildeter Executive Coach (2002). Sie kennt die hohen Anforderungen an Spitzenkräfte der Wirtschaft und die Herausforderungen der Führung, insbesondere in Transformations-Situationen.\n\nMit menschlicher Offenheit und einem klaren Anspruch, den Themen auf den Grund zu gehen, arbeitet sie Wesentliches heraus und bringt es in die Umsetzung. Die Sicherung der Coaching- und Trainingsergebnisse und der Transfer in den Führungsalltag stehen bei ihr im Vordergrund.\n\nAls leidenschaftliche Beraterin ist sie auch eine große Natur- und Tierliebhaberin. Seit knapp 20 Jahren ist sie lizenzierte Besitzertrainerin des Direktoriums für Vollblutzucht und Rennen und registrierte Züchterin von Vollblütern. Sie lebt mit ihren Pferden auf dem Naturareal PAASLEBEN und ist zertifizierter HOGAN und REISS Motivation Profil Master.',
      phone: '0173 / 88 33 018',
      email: 'maren.paas@grasleben.com',
      web: 'www.maren-paas.com',
    },
    {
      name: 'Tilman Paas',
      photo: 'images/gastgeber/tilman-paas.jpg',
      text: 'Tilman Paas ist Unternehmer, Künstler, Transformator und Multitalent. Ein Mann der wenigen, aber essentiellen Worte. Cowboy, Bauer, Immobilien-Unternehmer, Baggerfahrer, Tausendsassa, ‚Taugenichts‘ – er sagt, er ‚tauge für das Normale nicht‘.\n\nEin Seismograph für Authentizität. Visionär und Createur, der das Andere denkt und ungewöhnliche Ideen verwirklicht. Er bewegt sich permanent ‚out of the box‘ und verlässt Komfortzonen. Sein besonderes Talent: Er ermutigt andere, ihr volles Potential zu entfalten.',
      phone: '0172 / 966 9666',
      email: 'paas@grasleben.com',
      web: '',
    },
  ],
};

// Leere Felder in Firestore fallen auf den Startwert zurück — so lässt sich
// ein Text nicht versehentlich „wegspeichern".
const merge = (data = {}) => {
  const out = { ...DEFAULT_SITE_CONTENT };
  for (const [k, v] of Object.entries(data)) {
    if (k === 'hosts') { if (Array.isArray(v)) out.hosts = v; continue; }
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
};

let cached = null;
export const loadSiteContent = () => {
  cached = cached || getDoc(doc(db, ...CONTENT_DOC))
    .then((snap) => merge(snap.exists() ? snap.data() : {}))
    .catch((err) => {
      console.warn('Website-Texte nicht ladbar — nutze Startwerte:', err);
      return merge();
    });
  return cached;
};

export const saveSiteContent = (data) => {
  cached = null;
  return setDoc(doc(db, ...CONTENT_DOC), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Foto: Pfad unter public/, volle URL oder data-URL (Upload im Editor).
export const resolvePhoto = (photo, baseUrl = '/') => {
  if (!photo) return '';
  return /^(https?:|data:|\/)/.test(photo) ? photo : `${baseUrl}${photo}`;
};

// HTML des Gastgeber-Abschnitts für das Panel. Texte werden escaped —
// Absätze entstehen durch Leerzeilen, nicht durch HTML.
export const renderHostsHTML = (content, baseUrl = '/') => {
  const hosts = (content.hosts || []).filter((h) => h && (h.name || h.text));
  if (!hosts.length) return '';
  const items = hosts.map((h) => {
    const paras = String(h.text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const web = h.web ? h.web.replace(/^https?:\/\//, '') : '';
    const contact = [
      h.phone && `<a href="tel:${esc(String(h.phone).replace(/[^+\d]/g, '').replace(/^0/, '+49'))}">${esc(h.phone)}</a>`,
      h.email && `<a href="mailto:${esc(h.email)}">${esc(h.email)}</a>`,
      web && `<a href="https://${esc(web)}" target="_blank" rel="noopener">${esc(web)}</a>`,
    ].filter(Boolean).join('<br>');
    const photo = resolvePhoto(h.photo, baseUrl);
    return `<div class="pp-host">${photo ? `<img src="${esc(photo)}" alt="Porträt ${esc(h.name)}" loading="lazy">` : '<span></span>'}<div><h3>${esc(h.name)}</h3>${contact ? `<p class="pp-host-contact">${contact}</p>` : ''}${paras}</div></div>`;
  }).join('');
  return `<h2>${esc(content.hostsHeading || 'Die Gastgeber')}</h2>${items}`;
};
