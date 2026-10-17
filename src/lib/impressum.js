// Impressum der Website. Der Text liegt in Firestore (`paas_config/impressum`,
// Feld `html`) und ist im Editor bearbeitbar; der Standardtext hier dient als
// Startwert und als Fallback, wenn Firestore nicht erreichbar ist.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';

const IMPRESSUM_DOC = ['paas_config', 'impressum'];

export const DEFAULT_IMPRESSUM_HTML = `<h2>Impressum</h2>

<p>Angaben gemäß § 5 DDG</p>

<p>Maren Paas<br>Allerthalweg 20<br>38368 Grasleben</p>

<h3>Kontakt</h3>
<p>Telefon: +49 (0)173 8833018<br>E-Mail: <a href="mailto:kontakt@top-executive-events.com">kontakt@top-executive-events.com</a></p>

<h3>Umsatzsteuer-ID</h3>
<p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: wird nachgereicht</p>

<h3>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h3>
<p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>

<h3>Zentrale Kontaktstelle nach dem Digital Services Act – DSA (Verordnung (EU) 2022/2065)</h3>
<p>Unsere zentrale Kontaktstelle für Nutzer und Behörden nach Art. 11, 12 DSA erreichen Sie wie folgt:<br>E-Mail: <a href="mailto:kontakt@top-executive-events.com">kontakt@top-executive-events.com</a><br>Telefon: +49 (0)173 8833018<br>Post: Allerthalweg 20, 38368 Grasleben</p>
<p>Die für den Kontakt zur Verfügung stehenden Sprachen sind: Deutsch, Englisch.</p>

<h3>Bildnachweise</h3>
<p>Fotos: Thomas Bomm, <a href="https://www.immophoto24.de" target="_blank" rel="noopener">www.immophoto24.de</a>; Maren Paas<br>Skulpturen: Stephan Balkenhol</p>`;

export const loadImpressum = async () => {
  try {
    const snap = await getDoc(doc(db, ...IMPRESSUM_DOC));
    const html = snap.exists() ? snap.data().html : '';
    return typeof html === 'string' && html.trim() ? html : DEFAULT_IMPRESSUM_HTML;
  } catch (err) {
    console.warn('Impressum nicht ladbar — nutze Standardtext:', err);
    return DEFAULT_IMPRESSUM_HTML;
  }
};

export const saveImpressum = (html) =>
  setDoc(doc(db, ...IMPRESSUM_DOC), { html, updatedAt: serverTimestamp() }, { merge: true });
