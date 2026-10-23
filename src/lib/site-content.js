// Seitenweite Texte, die nicht zu einem einzelnen Ort gehören: Kopfbereich
// oben links, die allgemeine Kontakt-E-Mail und die Gastgeber-Profile (samt
// Kontaktdaten). Liegt in Firestore (`paas_config/content`) und wird im
// Editor unter „Website-Texte" gepflegt. Die Werte hier sind Startwerte und
// Fallback ohne Verbindung.
import { readDoc } from './firestore-rest.js';
import { t } from './i18n.js';

const CONTENT_DOC = 'paas_config/content';

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
  // Allgemeine Anfragen: Fußzeile, Willkommen, Bedienungs-Fenster.
  contactEmail: 'kontakt@paasleben.com',
  hostsHeading: 'Die Gastgeber',
  hosts: [
    {
      name: 'Maren Paas',
      role: 'Gastgeberin · Executive Coach',
      photo: 'images/gastgeber/maren-paas.jpg',
      text: 'Maren Paas ist seit über 33 Jahren Beraterin internationaler Führungskräfte (mehr als 30 Jahre Egon Zehnder) und ausgebildeter Executive Coach (2002). Sie kennt die hohen Anforderungen an Spitzenkräfte der Wirtschaft und die Herausforderungen der Führung, insbesondere in Transformations-Situationen.\n\nMit menschlicher Offenheit und einem klaren Anspruch, den Themen auf den Grund zu gehen, arbeitet sie Wesentliches heraus und bringt es in die Umsetzung. Die Sicherung der Coaching- und Trainingsergebnisse und der Transfer in den Führungsalltag stehen bei ihr im Vordergrund.\n\nAls leidenschaftliche Beraterin ist sie auch eine große Natur- und Tierliebhaberin. Seit knapp 20 Jahren ist sie lizenzierte Besitzertrainerin des Direktoriums für Vollblutzucht und Rennen und registrierte Züchterin von Vollblütern. Sie lebt mit ihren Pferden auf dem Naturareal PAASLEBEN und ist zertifizierter HOGAN und REISS Motivation Profil Master.',
      phone: '0173 / 88 33 018',
      email: 'maren.paas@grasleben.com',
      web: 'www.maren-paas.com',
    },
    {
      name: 'Tilman Paas',
      role: 'Gastgeber · Künstler & Unternehmer',
      photo: 'images/gastgeber/tilman-paas.jpg',
      text: 'Tilman Paas ist Unternehmer, Künstler, Transformator und Multitalent. Ein Mann der wenigen, aber essentiellen Worte. Cowboy, Bauer, Immobilien-Unternehmer, Baggerfahrer, Tausendsassa, ‚Taugenichts‘ – er sagt, er ‚tauge für das Normale nicht‘.\n\nEin Seismograph für Authentizität. Visionär und Createur, der das Andere denkt und ungewöhnliche Ideen verwirklicht. Er bewegt sich permanent ‚out of the box‘ und verlässt Komfortzonen. Sein besonderes Talent: Er ermutigt andere, ihr volles Potential zu entfalten.',
      phone: '0172 / 966 9666',
      email: 'paas@grasleben.com',
      web: '',
    },
  ],
};

// Leere Felder in Firestore fallen auf den Startwert zurück — so lässt sich
// ein Text nicht versehentlich „wegspeichern". Die englischen Felder (`*_en`,
// auch `role_en`/`text_en` in hosts[]) laufen als normale Strings bzw. mit dem
// Host-Array durch; ausgewählt wird die Sprache in localizeSite (i18n.js).
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
  cached = cached || readDoc(CONTENT_DOC)
    .then((data) => merge(data || {}))
    .catch((err) => {
      console.warn('Website-Texte nicht ladbar — nutze Startwerte:', err);
      return merge();
    });
  return cached;
};

// Nur im Editor genutzt — das SDK wird erst hier nachgeladen.
export const saveSiteContent = async (data) => {
  cached = null;
  const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('./firebase.js'),
  ]);
  return setDoc(doc(db, CONTENT_DOC), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Foto: Pfad unter public/, volle URL oder data-URL (Upload im Editor).
export const resolvePhoto = (photo, baseUrl = '/') => {
  if (!photo) return '';
  return /^(https?:|data:|\/)/.test(photo) ? photo : `${baseUrl}${photo}`;
};

export const mailtoHref = (email) => `mailto:${esc(String(email || '').trim())}`;

// Kontaktblock am Ende des Gastgeber-Abschnitts: die allgemeine Adresse für
// Anfragen, gut sichtbar statt nur in der Fußzeile.
const renderContactHTML = (content) => {
  const email = String(content.contactEmail || '').trim();
  if (!email) return '';
  return `<div class="pp-contact"><span class="t-caption">${esc(t('Anfragen & Kontakt'))}</span><a class="pp-contact-link" href="${mailtoHref(email)}">${esc(email)}</a></div>`;
};

const ICONS = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.6l1.3 4.1-2 1.4a12 12 0 0 0 6.5 6.5l1.4-2 4.1 1.3v2.6a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m4 6.5 8 6.5 8-6.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 12h17M12 3.5c2.6 2.5 2.6 14.5 0 17M12 3.5c-2.6 2.5-2.6 14.5 0 17" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};
const chip = (href, icon, label, external = false) =>
  `<a class="pp-chip" href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${ICONS[icon]}<span>${esc(label)}</span></a>`;

// HTML des Gastgeber-Abschnitts für das Panel: je Person eine Karte mit
// Porträt, Name, Rolle und Kontakt-Knöpfen, darunter der Profiltext. Texte
// werden escaped — Absätze entstehen durch Leerzeilen, nicht durch HTML.
export const renderHostsHTML = (content, baseUrl = '/') => {
  const hosts = (content.hosts || []).filter((h) => h && (h.name || h.text));
  if (!hosts.length) return renderContactHTML(content);
  const items = hosts.map((h) => {
    const paras = String(h.text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const web = h.web ? h.web.replace(/^https?:\/\//, '') : '';
    const contact = [
      h.phone && chip(`tel:${esc(String(h.phone).replace(/[^+\d]/g, '').replace(/^0/, '+49'))}`, 'phone', h.phone),
      h.email && chip(mailtoHref(h.email), 'mail', h.email),
      web && chip(`https://${esc(web)}`, 'web', web, true),
    ].filter(Boolean).join('');
    const photo = resolvePhoto(h.photo, baseUrl);
    return `<article class="pp-host">
      <div class="pp-host-head">
        ${photo ? `<img class="pp-host-photo" src="${esc(photo)}" alt="${esc(t('Porträt'))} ${esc(h.name)}" loading="lazy">` : ''}
        <div class="pp-host-id">
          ${h.role ? `<span class="pp-host-role t-caption">${esc(h.role)}</span>` : ''}
          <h3>${esc(h.name)}</h3>
          ${contact ? `<div class="pp-host-contact">${contact}</div>` : ''}
        </div>
      </div>
      <div class="pp-host-text">${paras}</div>
    </article>`;
  }).join('');
  return `<h2>${esc(content.hostsHeading || t('Die Gastgeber'))}</h2><div class="pp-hosts">${items}</div>${renderContactHTML(content)}`;
};
