// Daten-Layer für die Orte („Standpunkte"): Firestore-Collection
// `paas_locations`, mit committetem JSON-Snapshot als Offline-Fallback.
// Bilder sind entweder statische Assets (`url`, relativ zu public/) oder
// im Editor hochgeladene Fotos, die als Base64-Dokumente in `paas_images`
// liegen (`imageId`) — Letztere werden erst beim Öffnen eines Panels geladen.
// Die Website liest per REST (firestore-rest.js); das Live-Abo des Editors
// liegt in src/admin/live-locations.js.
import { readCollection, readDoc } from './firestore-rest.js';
import snapshotFallback from '../data/locations-snapshot.json';

const LOCATIONS = 'paas_locations';
const IMAGES = 'paas_images';

export const normalize = (id, data) => ({
  id,
  title: data.title || '',
  subtitle: data.subtitle || '',
  body: data.body || '',
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

// Lädt alle Orte; fällt bei Fehler/Timeout auf den committeten Snapshot zurück.
export const fetchLocations = async () => {
  try {
    const docs = await readCollection(LOCATIONS);
    if (!docs.length) return fromSnapshot();
    return docs.map((d) => normalize(d.id, d.data)).sort(byOrder);
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
