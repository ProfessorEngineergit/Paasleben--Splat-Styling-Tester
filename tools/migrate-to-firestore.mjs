// Einmalige Migration: befüllt die Firestore-Collection `paas_locations`
// aus dem bisherigen Datenbestand (tools/positions.json + public/content.csv
// + den ehemals hartkodierten Namen/Bild-Zuordnungen aus src/main.js).
//
// Auth: nutzt die lokale Firebase-CLI-Anmeldung (refresh token) und schreibt
// über die Firestore-REST-API. Idempotent — erneutes Ausführen überschreibt
// die Dokumente mit demselben Stand.
//
//   node tools/migrate-to-firestore.mjs [--dry-run]
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'tasks-4182a';
const COLLECTION = 'paas_locations';
const DRY_RUN = process.argv.includes('--dry-run');

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// ── Ehemalige Hardcodes aus src/main.js ────────────────────────────────
// Anzeigename je GLB-Marker (Traversierungs-Reihenfolge im alten Viewer).
const MARKER_NAME_OVERRIDES = {
  '01': 'Turm', '02': 'Trafo-Haus', '03': 'Frauen-Haus', '04': 'Hallen',
  '05': 'Teich-Haus', '06': 'Pferde-Wiese', '07': 'Willkommen',
  '08': 'Pferde-Stall', '09': 'Werkstatt', '10': 'Hühner-Stall',
  '11': 'Storchen-Nest', '12': 'Pfauen-Stall', '13': 'Loft', '14': 'Atelier',
};
// GLB-Position → Anzeige-/Sheet-Nummer (01 und 07 sind vertauscht).
const MARKER_DISPLAY_NUMBER = { '01': '07', '07': '01' };

const STANDPUNKT_BILDER = {
  '01': [
    { src: 'images/skulpturen/storchen-turm-skulptur.jpg', alt: 'Eisensäule mit Reisig-Krone, an ein Storchennest erinnernd' },
    { src: 'images/skulpturen/schornstein-sonnenuntergang.jpg', alt: 'Schornstein und Skulptur als Silhouette vor orange-rosa Abendhimmel' },
    { src: 'images/areal/turm-regenbogen.jpg', alt: 'Backsteinturm im Abendlicht, darüber ein Regenbogen am grauen Himmel' },
  ],
  '02': [
    { src: 'images/badehaus/badehaus-wohnraum.jpg', alt: 'Heller Wohnraum mit Holzbalkendecke, pinkem Sofa und Kunstdrucken' },
    { src: 'images/badehaus/badehaus-loft-treppe.jpg', alt: 'Loftraum mit Mezzanin, Holzleiter, pinkem Sofa und Bildersammlung' },
    { src: 'images/badehaus/badehaus-stillleben.jpg', alt: 'Stillleben aus Wildblumenstrauß, Weinflasche und gerahmtem Bild' },
  ],
  '03': [
    { src: 'images/areal/halle-festtafel.jpg', alt: 'Lange weiße Festtafel mit Stühlen und Kerzen in einem hohen Saal' },
    { src: 'images/areal/halle-festtafel-fenster.jpg', alt: 'Festtafel in einer Halle mit hohen Sprossenfenstern und Konzertflügel' },
    { src: 'images/areal/areal-stimmung-sonne-skulptur.jpg', alt: 'Außenbereich mit Skulptur und gedeckten Tafeln in der Abendsonne' },
  ],
  '04': [
    { src: 'images/areal/halle-festtafel-fenster.jpg', alt: 'Festtafel in einer Halle mit hohen Sprossenfenstern und Konzertflügel' },
    { src: 'images/areal/atmosphere-fenster-haus.jpg', alt: 'Innenraum mit Fensterblick auf ein kleines Backsteinhaus im Abendlicht' },
    { src: 'images/skulpturen/skulptur-saeulen.jpg', alt: 'Reihe vertikaler Stahlskulpturen vor altem Backsteingebäude' },
  ],
  '05': [
    { src: 'images/areal/teichhaus-tisch-mahlzeit.jpg', alt: 'Holztisch am Wasser mit Brot, Gemüse, Bierglas und Schneidebrett' },
    { src: 'images/umgebung/teich-pferde.jpg', alt: 'Stiller Teich mit Pferden auf der gegenüberliegenden Wiese, Spiegelung' },
    { src: 'images/badehaus/badehaus-wohnraum.jpg', alt: 'Heller Wohnraum mit Holzbalkendecke, pinkem Sofa und Kunstdrucken' },
    { src: 'images/areal/picknick-tisch-hund.jpg', alt: 'Sommerlich gedeckter Picknick-Tisch unter Bäumen, neben dem Tisch ein Hund' },
  ],
  '06': [
    { src: 'images/umgebung/pferde-regenbogen-koppel.jpg', alt: 'Pferde grasen auf einer Koppel, darüber ein klarer Regenbogen' },
    { src: 'images/umgebung/pferde-koppel-vier.jpg', alt: 'Vier dunkle Pferde auf grüner Weide, eines steht, drei liegen' },
    { src: 'images/umgebung/teich-pferde.jpg', alt: 'Stiller Teich mit Pferden auf der gegenüberliegenden Wiese, Spiegelung' },
    { src: 'images/umgebung/stute-fohlen-raps.jpg', alt: 'Stute mit Fohlen auf Frühlingswiese, im Hintergrund Baumreihe und Rapsfeld' },
    { src: 'images/umgebung/pferd-cor-ten-bogen.jpg', alt: 'Pferd, eingerahmt von einem rostigen Cor-Ten-Stahl-Bogen' },
    { src: 'images/umgebung/pferd-nandu-skulptur.jpg', alt: 'Pferd auf eingezäunter Wiese, im Vordergrund Nandu und Skulptur' },
  ],
  '07': [
    { src: 'images/areal/turm-regenbogen.jpg', alt: 'Backsteinturm im Abendlicht, darüber ein Regenbogen am grauen Himmel' },
    { src: 'images/areal/piazza-gruen-baumallee.jpg', alt: 'Piazza mit Baumallee und Cor-Ten-Skulptur unter blauem Himmel' },
    { src: 'images/areal/areal-pferd-skulptur.jpg', alt: 'Bronzene Pferde-Skulptur auf gepflastertem Hof vor Backsteingebäude' },
    { src: 'images/areal/areal-stimmung-sonne-skulptur.jpg', alt: 'Außenbereich mit Skulptur und gedeckten Tafeln in der Abendsonne' },
  ],
  '08': [
    { src: 'images/stall/stall-weitwinkel.jpg', alt: 'Großzügiger Reitstall mit Heuballen und Glasdach' },
    { src: 'images/stall/stall-gasse.jpg', alt: 'Stallgasse mit hellen, geschlossenen Pferdeboxen und Tageslicht' },
    { src: 'images/umgebung/pferd-cor-ten-bogen.jpg', alt: 'Pferd, eingerahmt von einem rostigen Cor-Ten-Stahl-Bogen' },
  ],
  '09': [
    { src: 'images/trafohaus/trafohaus-essbereich.jpg', alt: 'Hoher Raum im Trafohaus mit Glastisch, Skulptur und blauer Treppe' },
    { src: 'images/trafohaus/trafohaus-kueche-kupfer.jpg', alt: 'Küchenbereich mit Reihe aufgehängter Kupferpfannen am Fenster' },
    { src: 'images/trafohaus/trafohaus-leuchter-glas.jpg', alt: 'Bunter Glas-Leuchter über dunkelblauem Sofa unter einem Dachfenster' },
    { src: 'images/skulpturen/skulptur-rad.jpg', alt: 'Übergroßes rostiges Eisenrad als Skulptur, daneben ein Holzstapel' },
  ],
  // 10 — Hühner-Stall: bewusst ohne Bilder.
  '11': [
    { src: 'images/skulpturen/storchen-turm-skulptur.jpg', alt: 'Eisensäule mit Reisig-Krone, an ein Storchennest erinnernd' },
    { src: 'images/skulpturen/schornstein-sonnenuntergang.jpg', alt: 'Schornstein und Skulptur als Silhouette vor orange-rosa Abendhimmel' },
  ],
  '12': [
    { src: 'images/skulpturen/skulptur-buch-pfauen.jpg', alt: 'Buch-Skulptur aus Cor-Ten-Stahl im Garten, Pfauen davor' },
    { src: 'images/umgebung/nandus-wiese.jpg', alt: 'Drei Nandus auf einer Sommerwiese unter Wolkenhimmel' },
    { src: 'images/umgebung/nandu-cor-ten.jpg', alt: 'Nandu eingerahmt von einer Cor-Ten-Stahl-Skulptur' },
    { src: 'images/umgebung/nandu-wildwiese.jpg', alt: 'Nandu in hoher Wildwiese mit Königskerze und Disteln' },
  ],
  // 13 — Loft: bisher nicht im GLB; ein passendes Bild liegt bereit.
  '13': [
    { src: 'images/loft/loft-treppe-silhouette.jpg', alt: 'Loft-Treppe als Silhouette im Gegenlicht' },
  ],
};

// ── CSV einlesen (gleicher Parser wie im Viewer) ───────────────────────
const parseCSV = (text) => {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
};

const sheet = Object.create(null);
for (const row of parseCSV(readFileSync(join(root, 'public/content.csv'), 'utf8'))) {
  const key = (row[0] || '').trim();
  if (!key || /^key$/i.test(key)) continue;
  sheet[key] = (row[1] ?? '').trim();
}

const positions = JSON.parse(readFileSync(join(root, 'tools/positions.json'), 'utf8'));

// ── Dokumente bauen ────────────────────────────────────────────────────
const slugify = (s) => s.toLowerCase()
  .replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const docs = [];
const markers = [...positions.map((p) => p.marker), '13', '14'];
for (const marker of markers) {
  const display = MARKER_DISPLAY_NUMBER[marker] || marker;
  const posEntry = positions.find((p) => p.marker === marker);
  const title = sheet[`place_${display}_title`] || MARKER_NAME_OVERRIDES[marker] || `Standpunkt ${display}`;
  const images = (STANDPUNKT_BILDER[marker] || []).map((b, i) => ({ url: b.src, alt: b.alt || '', order: i }));
  docs.push({
    id: `${display}-${slugify(title)}`,
    fields: {
      title,
      subtitle: sheet[`place_${display}_subtitle`] || '',
      body: sheet[`place_${display}_body`] || '',
      displayNumber: display,
      order: Number(display),
      // 13/14 haben (noch) keine Position im GLB → unsichtbar in der Mitte
      // parken; der Besitzer platziert sie im Editor und blendet sie ein.
      visible: Boolean(posEntry),
      position: posEntry
        ? posEntry.position
        : { x: 0.3 * (Number(marker) - 12), y: 0.25, z: 0.3 * (Number(marker) - 12) },
      images,
      updatedAt: new Date().toISOString(),
    },
  });
}

// ── Firestore-REST-Encoding ────────────────────────────────────────────
const toValue = (v) => {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (v && typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
  throw new Error(`Unsupported value: ${v}`);
};

const mintToken = async () => {
  const store = JSON.parse(readFileSync(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8'));
  const refreshToken = store.tokens?.refresh_token
    ?? Object.values(store.activeAccounts ?? {})[0]?.tokens?.refresh_token
    ?? store.user?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('Kein Firebase-CLI-Login gefunden (firebase login ausführen).');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    // Öffentlicher OAuth-Client der Firebase CLI (kein Geheimnis).
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Token-Tausch fehlgeschlagen: ${JSON.stringify(json)}`);
  return json.access_token;
};

if (DRY_RUN) {
  for (const d of docs) {
    console.log(`── ${COLLECTION}/${d.id}`);
    console.log(JSON.stringify(d.fields, null, 2).slice(0, 400));
  }
  console.log(`\n${docs.length} Dokumente (dry-run, nichts geschrieben).`);
  process.exit(0);
}

const token = await mintToken();
for (const d of docs) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${encodeURIComponent(d.id)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, toValue(v)])) }),
  });
  if (!res.ok) throw new Error(`${d.id}: HTTP ${res.status} ${await res.text()}`);
  console.log(`✔ ${COLLECTION}/${d.id}`);
}
console.log(`\n${docs.length} Dokumente geschrieben.`);
