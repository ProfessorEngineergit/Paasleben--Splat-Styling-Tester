// Inhalts-Update Oktober 2026 (Feedback Maren Paas):
//   • „Willkommen" wird zum Willkommensbanner: nur noch die Begrüßung, dazu
//     die Gastgeber-Profile und der Platzhalter für das Video.
//   • Die Geschichte des Areals (Raupen-Flucht, Renaturierung) wandert in
//     einen eigenen Ort „Geschichte" direkt dahinter — Nr. 02.
//   • Alle folgenden Orte rücken eine Nummer weiter.
//   • Neue Orte „Nandu-Weide" und „Skulpturen" am Ende der Liste.
//
// Reine Funktion ohne Firestore-Zugriff: bekommt die Orte als
// [{ id, ...felder }] und liefert, was zu ändern bzw. anzulegen ist. So lässt
// sie sich auch für den Snapshot-Fallback (tools/) verwenden. Bereits
// erledigte Teile (Ort existiert schon) werden übersprungen.

export const ID = '2026-10-willkommen-geschichte-orte';

const pad = (n) => String(n).padStart(2, '0');
const isNumber = (value) => /^\d{1,2}$/.test(String(value ?? ''));
const now = () => new Date().toISOString();

// Fallback, falls der Willkommen-Text die Geschichte nicht (mehr) enthält.
const HISTORY_FALLBACK = [
  'Das ehemalige Fabrikgelände hat eine eigene Geschichte: bekannt aus der ZDF-Dokumentation <a href="https://www.zdf.de/video/dokus/terra-x-history-ein-tag-in-der-ddr-100/terra-x-history-die-flucht-mit-der-raupe-film-doku-100" target="_blank" rel="noopener">‚Die Flucht mit der Raupe\'</a>. 1963 floh ein Bauarbeiter mit einer Planierraupe über die innerdeutsche Grenze in den Westen — eine der filmreifsten DDR-Fluchten überhaupt. Der Schauplatz dieser Geschichte ist heute PAASLEBEN.',
  'Ab 2013 wurde das Gelände renaturiert, 500 Bäume gepflanzt, historische Gebäudeteile erhalten und ertüchtigt. Heute leben hier domestizierte und wilde Tiere zwischen Skulpturen — und der Künstler, der diesen Ort geschaffen hat.',
];

// Positionen in Weltkoordinaten der Karte (wie im Editor). Grob gesetzt —
// feinjustieren geht im Editor per Ziehen.
const HISTORY_OFFSET = { x: -0.85, z: -0.27 }; // „dahinter": den Weg hinauf Richtung Hof
const NEW_PLACES = [
  {
    id: 'nandu-weide',
    title: 'Nandu-Weide',
    subtitle: 'Laufvögel aus Südamerika',
    body: 'Auf der Nandu-Weide leben die Nandus von PAASLEBEN — große, flugunfähige Laufvögel aus Südamerika. Wer sich Zeit nimmt, kann sie zwischen hohem Gras, Skulpturen und Cor-Ten-Stahl beobachten.',
    position: { x: -2.7, y: 0.26, z: 1.8 }, // Koppeln unten links, neben der Pferde-Wiese
    showCaptions: false,
    images: [
      { url: 'images/umgebung/nandus-wiese.jpg', alt: 'Drei Nandus auf einer Sommerwiese unter Wolkenhimmel' },
      { url: 'images/umgebung/nandu-wildwiese.jpg', alt: 'Nandu in hoher Wildwiese mit Königskerze und Disteln' },
      { url: 'images/umgebung/nandu-kopf-nah.jpg', alt: 'Kopf eines Nandus aus der Nähe, dahinter die Koppel' },
      { url: 'images/umgebung/nandu-cor-ten.jpg', alt: 'Nandu, eingerahmt von einer Ring-Skulptur aus Cor-Ten-Stahl' },
    ],
  },
  {
    id: 'skulpturen',
    title: 'Skulpturen',
    subtitle: 'Kunst zwischen Bäumen und Tieren',
    body: 'Überall auf dem Areal stehen Skulpturen — aus Stahl, Cor-Ten und Bronze, zwischen Bäumen, Wiesen und Tieren. Morgennebel und Abendlicht lassen sie jeden Tag anders aussehen.',
    position: { x: 0.15, y: 0.22, z: -0.05 }, // Garten östlich des Turms
    showCaptions: true,
    images: [
      { url: 'images/skulpturen/hut-figur-nebel-morgenrot.jpg', alt: 'Schreitende Figur mit Hut, im Morgennebel gegen die Sonne' },
      { url: 'images/skulpturen/ring-skulptur-nebel.jpg', alt: 'Ringförmige Stahlskulptur auf der nebligen Wiese' },
      { url: 'images/skulpturen/skulptur-buch-pfauen.jpg', alt: 'Buch-Skulptur aus Cor-Ten-Stahl, davor Pfauen' },
      { url: 'images/skulpturen/spirale-stahl.jpg', alt: 'Spiralförmige Stahlskulptur vor einer Bruchsteinmauer' },
      { url: 'images/skulpturen/skulptur-saeulen.jpg', alt: 'Reihe vertikaler Stahlskulpturen vor altem Backsteingebäude' },
      { url: 'images/skulpturen/skulptur-rad.jpg', alt: 'Übergroßes rostiges Eisenrad, daneben ein Holzstapel' },
    ],
  },
];

const withOrder = (images) => images.map((img, i) => ({ ...img, order: i }));
const stripTags = (html) => String(html || '').replace(/<[^>]+>/g, '');

/**
 * @param {Array<{id: string}>} locations Orte mit ihren Firestore-Feldern
 * @returns {{ updates: Record<string, object>, creates: Record<string, object>, summary: string[] }}
 */
export const plan = (locations) => {
  const byId = new Map(locations.map((loc) => [loc.id, loc]));
  const updates = {};
  const creates = {};
  const summary = [];
  const numberOf = (loc) => (updates[loc.id]?.displayNumber ?? loc.displayNumber);

  const welcome = byId.get('01-willkommen')
    || locations.find((loc) => /^willkommen$/i.test(String(loc.title || '').trim()));

  if (welcome && !byId.has('geschichte')) {
    const paragraphs = String(welcome.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const isHostsLine = (p) => /^gastgeber sind/i.test(stripTags(p).trim());
    const greeting = paragraphs.slice(0, 1);
    const history = paragraphs.slice(1).filter((p) => !isHostsLine(p));

    // Alles hinter Willkommen rückt eine Nummer weiter, damit „Geschichte"
    // die 02 bekommt. Nur echte Nummern bzw. Reihenfolgen anfassen.
    const welcomeOrder = typeof welcome.order === 'number' ? welcome.order : 1;
    for (const loc of locations) {
      if (loc.id === welcome.id) continue;
      const fields = {};
      if (typeof loc.order === 'number' && loc.order > welcomeOrder) fields.order = loc.order + 1;
      if (isNumber(loc.displayNumber) && Number(loc.displayNumber) >= 2) {
        fields.displayNumber = pad(Number(loc.displayNumber) + 1);
      }
      if (Object.keys(fields).length) updates[loc.id] = fields;
    }

    updates[welcome.id] = {
      ...(greeting.length ? { body: greeting.join('\n\n') } : {}),
      showHosts: true,
      videoPlaceholder: true,
      updatedAt: now(),
    };

    const wp = welcome.position || { x: 0, y: 0.2, z: 0 };
    creates.geschichte = {
      title: 'Geschichte',
      subtitle: 'Die Flucht mit der Raupe',
      body: (history.length ? history : HISTORY_FALLBACK).join('\n\n'),
      video: '',
      videoPlaceholder: false,
      showHosts: false,
      showCaptions: false,
      displayNumber: '02',
      order: welcomeOrder + 1,
      visible: true,
      position: { x: wp.x + HISTORY_OFFSET.x, y: wp.y, z: wp.z + HISTORY_OFFSET.z },
      images: withOrder([
        { url: 'images/werkstatt/werkstatt-maschine-alt.jpg', alt: 'Alte Werkstattmaschine mit Handrädern und Spindeln vor Bruchsteinwand' },
        { url: 'images/werkstatt/zahnrad-gross.jpg', alt: 'Großes rostiges Zahnrad mit Antriebswelle aus der Nähe' },
        { url: 'images/skulpturen/schornstein-sonnenuntergang.jpg', alt: 'Schornstein und Skulptur als Silhouette vor orange-rosa Abendhimmel' },
      ]),
      updatedAt: now(),
    };
    summary.push('„Willkommen“ mit Gastgebern und Video-Platzhalter', '„Geschichte“ als Nr. 02 angelegt', 'folgende Orte eine Nummer weiter');
  }

  // Neue Orte hinten anhängen.
  const all = [...locations, ...Object.entries(creates).map(([id, data]) => ({ id, ...data }))];
  let last = Math.max(0, ...all.map((loc) => (isNumber(numberOf(loc)) ? Number(numberOf(loc)) : 0)));
  let lastOrder = Math.max(0, ...all.map((loc) => {
    const order = updates[loc.id]?.order ?? loc.order;
    return typeof order === 'number' && order < 999 ? order : 0;
  }));
  for (const place of NEW_PLACES) {
    if (byId.has(place.id)) continue;
    last += 1;
    lastOrder += 1;
    const { id, images, ...data } = place;
    creates[id] = {
      ...data,
      video: '',
      videoPlaceholder: false,
      showHosts: false,
      displayNumber: pad(last),
      order: lastOrder,
      visible: true,
      images: withOrder(images),
      updatedAt: now(),
    };
    summary.push(`„${place.title}“ als Nr. ${pad(last)} angelegt`);
  }

  return { updates, creates, summary };
};
