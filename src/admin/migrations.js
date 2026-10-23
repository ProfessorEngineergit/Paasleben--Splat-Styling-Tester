// Einmalige Inhalts-Updates, die mit dem Code ausgeliefert werden, aber in
// Firestore landen müssen (neue Orte, Umnummerierungen …). Der Code kann
// Firestore nicht selbst beschreiben — das darf nur ein angemeldeter Admin.
// Deshalb läuft jedes Update beim ersten Editor-Start nach dem Deploy, in
// einer Transaktion und genau einmal: erledigte IDs stehen in
// `paas_config/migrations` (Feld `applied`). Starten zwei Editoren
// gleichzeitig, gewinnt einer, der andere sieht das Update als erledigt.
import {
  collection, doc, getDocs, runTransaction,
} from 'firebase/firestore';
import { db as defaultDb } from '../lib/firebase.js';
import * as willkommen2026 from '../lib/content-updates/2026-10-willkommen.js';

const MIGRATIONS = [willkommen2026];
const LOCATIONS = 'paas_locations';

const runOne = async (db, migration) => {
  const STATE = doc(db, 'paas_config', 'migrations');
  // Collection-Abfragen gibt es in Transaktionen nicht: erst die IDs holen,
  // dann jedes Dokument in der Transaktion lesen (und damit absichern).
  const ids = (await getDocs(collection(db, LOCATIONS))).docs.map((d) => d.id);
  return runTransaction(db, async (tx) => {
    const state = await tx.get(STATE);
    const applied = state.exists() ? state.data().applied || [] : [];
    if (applied.includes(migration.ID)) return null;

    const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, LOCATIONS, id))));
    const locations = snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...s.data() }));
    const { updates, creates, summary } = migration.plan(locations);

    for (const [id, fields] of Object.entries(updates)) tx.update(doc(db, LOCATIONS, id), fields);
    for (const [id, data] of Object.entries(creates)) tx.set(doc(db, LOCATIONS, id), data);
    tx.set(STATE, { applied: [...applied, migration.ID], updatedAt: new Date().toISOString() }, { merge: true });
    return summary;
  });
};

/** Führt alle offenen Updates aus; liefert die Beschreibungen der erledigten. */
export const runPendingMigrations = async (db = defaultDb) => {
  const done = [];
  for (const migration of MIGRATIONS) {
    const summary = await runOne(db, migration);
    if (summary?.length) done.push(...summary);
  }
  return done;
};
