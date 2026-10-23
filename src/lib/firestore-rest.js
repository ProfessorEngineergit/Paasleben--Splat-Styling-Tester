// Lesender Firestore-Zugriff der öffentlichen Website über die REST-API —
// bewusst ohne Firebase-SDK. Das SDK legt beim Besucher IndexedDB-Datenbanken
// an (Offline-Cache, „firebase-heartbeat-database") und wiegt rund 600 KB;
// die Website braucht aber nur ein paar öffentliche Dokumente zu lesen.
// So speichert die Seite nichts im Browser (DSGVO/TDDDG) und lädt schneller.
// Geschrieben wird ausschließlich im Editor, dort weiter über das SDK.
import { firebaseConfig } from './firebase-config.js';

const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const TIMEOUT_MS = 8000;

// REST-Typwerte ({stringValue: …}, {mapValue: …} …) → normale JS-Werte.
const decodeValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  return null;
};

const decodeFields = (fields = {}) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));

const request = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Firestore ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const withKey = (path, params = '') =>
  `${BASE}/${path}?key=${encodeURIComponent(firebaseConfig.apiKey)}${params}`;

/** Ein Dokument als Objekt, oder null, wenn es nicht existiert. */
export const readDoc = async (path) => {
  const json = await request(withKey(path));
  return json ? decodeFields(json.fields) : null;
};

/** Alle Dokumente einer Collection als [{ id, data }]. */
export const readCollection = async (collectionPath) => {
  const docs = [];
  let pageToken = '';
  do {
    const json = await request(withKey(collectionPath,
      `&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`));
    for (const d of json?.documents || []) {
      docs.push({ id: d.name.split('/').pop(), data: decodeFields(d.fields) });
    }
    pageToken = json?.nextPageToken || '';
  } while (pageToken);
  return docs;
};
