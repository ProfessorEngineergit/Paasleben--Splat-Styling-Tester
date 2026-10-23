// Live-Abo der Orte für den Editor (Firebase-SDK). Die Website selbst liest
// ohne SDK, siehe src/lib/locations.js.
import {
  collection, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { normalize } from '../lib/locations.js';

export const subscribeLocations = (cb, onError) => {
  const q = query(collection(db, 'paas_locations'), orderBy('order'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => normalize(d.id, d.data()))),
    (err) => {
      console.warn('Locations-Abo fehlgeschlagen:', err);
      if (onError) onError(err);
    },
  );
};
