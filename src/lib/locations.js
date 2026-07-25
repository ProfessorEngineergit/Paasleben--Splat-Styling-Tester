// Daten-Layer für die Orte („Standpunkte"): Firestore-Collection
// `paas_locations`, mit committetem JSON-Snapshot als Offline-Fallback.
// Bilder sind entweder statische Assets (`url`, relativ zu public/) oder
// im Editor hochgeladene Fotos, die als Base64-Dokumente in `paas_images`
// liegen (`imageId`) — Letztere werden erst beim Öffnen eines Panels geladen.
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from './firebase.js';
import snapshotFallback from '../data/locations-snapshot.json';

const LOCATIONS = 'paas_locations';
const IMAGES = 'paas_images';
const FETCH_TIMEOUT_MS = 8000;

const normalize = (id, data) => ({
  id,
  title: data.title || '',
  subtitle: data.subtitle || '',
  body: data.body || '',
  displayNumber: data.displayNumber || '',
  order: typeof data.order === 'number' ? data.order : 999,
  visible: data.visible !== false,
  position: data.position || { x: 0, y: 0, z: 0 },
  images: Array.isArray(data.images)
    ? [...data.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : [],
});

const fromSnapshot = () =>
  snapshotFallback.map(({ id, ...data }) => normalize(id, data));

// Lädt alle Orte; fällt bei Fehler/Timeout auf den committeten Snapshot zurück.
export const fetchLocations = async () => {
  try {
    const q = query(collection(db, LOCATIONS), orderBy('order'));
    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Firestore-Timeout')), FETCH_TIMEOUT_MS)),
    ]);
    if (snap.empty) return fromSnapshot();
    return snap.docs.map((d) => normalize(d.id, d.data()));
  } catch (err) {
    console.warn('Orte aus Firestore nicht ladbar — nutze Snapshot:', err);
    return fromSnapshot();
  }
};

// Live-Abo für den Editor (und optional den Viewer).
export const subscribeLocations = (cb, onError) => {
  const q = query(collection(db, LOCATIONS), orderBy('order'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => normalize(d.id, d.data()))),
    (err) => {
      console.warn('Locations-Abo fehlgeschlagen:', err);
      if (onError) onError(err);
    },
  );
};

// Cache für hochgeladene Bilder (paas_images → data-URL).
const imageDataCache = new Map();

const loadImageData = async (imageId) => {
  if (imageDataCache.has(imageId)) return imageDataCache.get(imageId);
  const promise = getDoc(doc(db, IMAGES, imageId)).then((snap) => {
    const data = snap.exists() ? snap.data().data : null;
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
