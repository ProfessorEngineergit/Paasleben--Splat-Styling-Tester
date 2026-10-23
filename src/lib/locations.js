// Daten-Layer für die Orte („Standpunkte"): Firestore-Collection
// `paas_locations`, mit committetem JSON-Snapshot als Offline-Fallback.
// Bilder sind entweder statische Assets (`url`, relativ zu public/) oder
// im Editor hochgeladene Fotos, die als Base64-Dokumente in `paas_images`
// liegen (`imageId`) — Letztere werden erst beim Öffnen eines Panels geladen.
// Die Website liest per REST (firestore-rest.js); das Live-Abo des Editors
// liegt in src/admin/live-locations.js.
import { readCollection, readDoc } from './firestore-rest.js';
import snapshotFallback from '../data/locations-snapshot.json';
import * as willkommen2026 from './content-updates/2026-10-willkommen.js';

const LOCATIONS = 'paas_locations';
const IMAGES = 'paas_images';

export const normalize = (id, data) => ({
  id,
  title: data.title || '',
  subtitle: data.subtitle || '',
  body: data.body || '',
  // Englische Texte (im Editor gepflegt); leer = Standardtext aus translations-en.js.
  title_en: data.title_en || '',
  subtitle_en: data.subtitle_en || '',
  body_en: data.body_en || '',
  // Optionales Hintergrundvideo (Pfad relativ zu public/ oder volle URL).
  video: data.video || '',
  // Solange kein Video hinterlegt ist: Platzhalter-Rahmen statt der Fotos.
  videoPlaceholder: data.videoPlaceholder === true,
  // Gastgeber-Abschnitt (Website-Texte) unter dem Fließtext anzeigen.
  showHosts: data.showHosts === true,
  // Alt-Texte der Fotos als Bildunterschrift zeigen (z. B. Kunstwerke).
  showCaptions: data.showCaptions === true,
  displayNumber: data.displayNumber || '',
  order: typeof data.order === 'number' ? data.order : 999,
  visible: data.visible !== false,
  position: data.position || { x: 0, y: 0, z: 0 },
  images: Array.isArray(data.images)
    ? [...data.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [],
});

export const byOrder = (a, b) => a.order - b.order;

const fromSnapshot = () =>
  snapshotFallback.map(({ id, ...data }) => normalize(id, data)).sort(byOrder);

// Inhalts-Updates, die der Editor noch nicht nach Firestore geschrieben hat
// (das passiert erst beim nächsten Editor-Login, siehe src/admin/migrations.js),
// zeigt die Website schon jetzt: dieselbe reine Plan-Funktion, im Speicher
// angewendet. Sobald das Update in Firestore steht, wird hier nichts mehr getan.
const CONTENT_UPDATES = [willkommen2026];
const applyPendingUpdates = async (locations) => {
  let applied = [];
  try {
    applied = (await readDoc('paas_config/migrations'))?.applied || [];
  } catch {
    return locations; // ohne Status lieber nichts verändern
  }
  let result = locations;
  for (const update of CONTENT_UPDATES) {
    if (applied.includes(update.ID)) continue;
    const { updates, creates } = update.plan(result);
    result = result
      .map((loc) => normalize(loc.id, { ...loc, ...(updates[loc.id] || {}) }))
      .concat(Object.entries(creates).map(([id, data]) => normalize(id, data)))
      .sort(byOrder);
  }
  return result;
};

// Lädt alle Orte; fällt bei Fehler/Timeout auf den committeten Snapshot zurück.
export const fetchLocations = async () => {
  try {
    const docs = await readCollection(LOCATIONS);
    if (!docs.length) return fromSnapshot();
    return applyPendingUpdates(docs.map((d) => normalize(d.id, d.data)).sort(byOrder));
  } catch (err) {
    console.warn('Orte aus Firestore nicht ladbar — nutze Snapshot:', err);
    return fromSnapshot();
  }
};

// Cache für hochgeladene Bilder (paas_images → data-URL).
const imageDataCache = new Map();

const loadImageData = async (imageId) => {
  if (imageDataCache.has(imageId)) return imageDataCache.get(imageId);
  const promise = readDoc(`${IMAGES}/${imageId}`).then((image) => {
    const data = image?.data || null;
    if (!data) imageDataCache.delete(imageId);
    return data;
  }).catch((err) => {
    console.warn(`Bild ${imageId} nicht ladbar:`, err);
    imageDataCache.delete(imageId);
    return null;
  });
  imageDataCache.set(imageId, promise);
  return promise;
};

// Löst die Bild-Einträge eines Ortes zu {src, alt} auf (für <img src>).
export const resolveImages = async (location, baseUrl = '/') => {
  const resolved = await Promise.all(location.images.map(async (img) => {
    if (img.url) return { src: `${baseUrl}${img.url}`, alt: img.alt || '' };
    if (img.imageId) {
      const data = await loadImageData(img.imageId);
      return data ? { src: data, alt: img.alt || '' } : null;
    }
    return null;
  }));
  return resolved.filter(Boolean);
};
