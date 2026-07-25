// Exportiert die aktuelle `paas_locations`-Collection als Fallback-Snapshot
// nach src/data/locations-snapshot.json. Der Viewer nutzt diese Datei, wenn
// Firestore nicht erreichbar ist. Nach größeren Inhaltsänderungen im Editor
// gelegentlich neu ausführen und committen.
//
//   node tools/export-snapshot.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'tasks-4182a';
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const fromValue = (v) => {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue(x)]));
  throw new Error(`Unbekannter Firestore-Wert: ${JSON.stringify(v)}`);
};

// `paas_locations` ist öffentlich lesbar — kein Token nötig.
const docs = [];
let pageToken = '';
do {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/paas_locations`);
  url.searchParams.set('pageSize', '300');
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const json = await res.json();
  for (const doc of json.documents || []) {
    const id = doc.name.split('/').pop();
    docs.push({ id, ...Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromValue(v)])) });
  }
  pageToken = json.nextPageToken || '';
} while (pageToken);

docs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

mkdirSync(join(root, 'src/data'), { recursive: true });
writeFileSync(join(root, 'src/data/locations-snapshot.json'), `${JSON.stringify(docs, null, 2)}\n`);
console.log(`${docs.length} Orte → src/data/locations-snapshot.json`);
