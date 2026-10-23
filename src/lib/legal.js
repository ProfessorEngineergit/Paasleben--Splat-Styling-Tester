// Rechtstexte der Website: Impressum und Datenschutzerklärung. Die Texte
// liegen in Firestore (`paas_config/impressum` bzw. `paas_config/datenschutz`,
// Feld `html`) und sind im Editor unter „Website-Texte" bearbeitbar. Die
// Standardtexte hier sind Startwert und Fallback ohne Verbindung.
//
// Die Datenschutzerklärung beschreibt den technischen Stand dieses Repos
// (Hosting IONOS, Inhalte aus Google Firestore per REST, Schriften lokal,
// keine Cookies, kein Tracking). Ändert sich daran etwas — etwa ein
// eingebettetes YouTube-Video oder ein Analyse-Tool —, muss der Text mit.
import { readDoc } from './firestore-rest.js';

export const DEFAULT_IMPRESSUM_HTML = `<h2>Impressum</h2>

<p>Angaben gemäß § 5 DDG</p>

<p>Maren Paas<br>Allerthalweg 20<br>38368 Grasleben</p>

<h3>Kontakt</h3>
<p>Telefon: +49 (0)173 8833018<br>E-Mail: <a href="mailto:kontakt@paasleben.com">kontakt@paasleben.com</a></p>

<h3>Umsatzsteuer-ID</h3>
<p>Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz: wird nachgereicht</p>

<h3>Verbraucherstreitbeilegung / Universalschlichtungsstelle</h3>
<p>Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>

<h3>Zentrale Kontaktstelle nach dem Digital Services Act – DSA (Verordnung (EU) 2022/2065)</h3>
<p>Unsere zentrale Kontaktstelle für Nutzer und Behörden nach Art. 11, 12 DSA erreichen Sie wie folgt:<br>E-Mail: <a href="mailto:kontakt@paasleben.com">kontakt@paasleben.com</a><br>Telefon: +49 (0)173 8833018<br>Post: Allerthalweg 20, 38368 Grasleben</p>
<p>Die für den Kontakt zur Verfügung stehenden Sprachen sind: Deutsch, Englisch.</p>

<h3>Bildnachweise</h3>
<p>Fotos: Thomas Bomm, <a href="https://www.immophoto24.de" target="_blank" rel="noopener">www.immophoto24.de</a>; Maren Paas<br>Skulpturen: Stephan Balkenhol</p>`;

export const DEFAULT_DATENSCHUTZ_HTML = `<h2>Datenschutzerklärung</h2>

<p>Wir freuen uns über Ihr Interesse an PAASLEBEN. Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Nachfolgend informieren wir Sie gemäß Art. 13 der Datenschutz-Grundverordnung (DSGVO) darüber, welche Daten beim Besuch dieser Website verarbeitet werden.</p>

<h3>1. Verantwortliche</h3>
<p>Maren Paas<br>Allerthalweg 20<br>38368 Grasleben<br>Telefon: +49 (0)173 8833018<br>E-Mail: <a href="mailto:kontakt@paasleben.com">kontakt@paasleben.com</a></p>

<h3>2. Das Wichtigste in Kürze</h3>
<p>Diese Website setzt keine Cookies, verwendet keine Analyse- oder Tracking-Werkzeuge und keine Werbedienste. Sie speichert beim Besuch keine Daten in Ihrem Browser. Schriften und Bilder werden von unserem eigenen Webspace geladen.</p>

<h3>3. Hosting und Server-Logfiles</h3>
<p>Die Website wird bei der IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, gehostet. Beim Aufruf der Seiten verarbeitet der Webserver automatisch Informationen, die Ihr Browser übermittelt: IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Datei, übertragene Datenmenge, Referrer-URL sowie Browser und Betriebssystem. Diese Daten sind technisch erforderlich, um die Website auszuliefern und ihre Sicherheit und Stabilität zu gewährleisten.</p>
<p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und fehlerfreien Betrieb der Website. Mit IONOS besteht ein Vertrag über die Auftragsverarbeitung nach Art. 28 DSGVO. Die Logfiles werden nur so lange gespeichert, wie es für diese Zwecke erforderlich ist, und anschließend gelöscht oder anonymisiert.</p>

<h3>4. Inhalte aus Google Cloud Firestore</h3>
<p>Texte, Standorte und hochgeladene Fotos der interaktiven Karte werden in der Datenbank Google Cloud Firestore (Firebase) gespeichert und beim Aufruf der Seite direkt von dort geladen. Anbieter ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Dabei wird technisch bedingt Ihre IP-Adresse an Server von Google übermittelt; es werden keine Cookies gesetzt und keine Nutzerprofile gebildet.</p>
<p>Eine Übermittlung von Daten in die USA an die Google LLC kann nicht ausgeschlossen werden. Die Google LLC ist nach dem EU-US Data Privacy Framework zertifiziert, für das die EU-Kommission einen Angemessenheitsbeschluss erlassen hat (Art. 45 DSGVO). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt in der einfachen und aktuellen Pflege der Inhalte. Weitere Informationen: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">policies.google.com/privacy</a> und <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener">firebase.google.com/support/privacy</a>.</p>

<h3>5. Schriftarten</h3>
<p>Die verwendeten Schriftarten sind lokal auf unserem Webspace eingebunden. Beim Aufruf der Website wird keine Verbindung zu Servern von Google Fonts oder anderen Schriftanbietern hergestellt.</p>

<h3>6. Kontakt per E-Mail oder Telefon</h3>
<p>Wenn Sie uns per E-Mail oder Telefon kontaktieren, verarbeiten wir Ihre Angaben (z. B. Name, E-Mail-Adresse, Telefonnummer, Inhalt der Anfrage), um Ihr Anliegen zu bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihre Anfrage auf einen Vertrag oder vorvertragliche Maßnahmen zielt, im Übrigen Art. 6 Abs. 1 lit. f DSGVO (Beantwortung Ihrer Anfrage). Die Daten werden gelöscht, sobald sie für diesen Zweck nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>

<h3>7. Links zu anderen Websites</h3>
<p>Die Website enthält Links zu externen Angeboten (z. B. ZDF-Mediathek, Websites der Gastgeber). Diese werden erst aufgerufen, wenn Sie den Link anklicken; ab dann gilt die Datenschutzerklärung des jeweiligen Anbieters.</p>

<h3>8. Verschlüsselung</h3>
<p>Diese Website nutzt aus Sicherheitsgründen eine SSL- bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie an „https://“ und dem Schloss-Symbol in der Adresszeile Ihres Browsers.</p>

<h3>9. Ihre Rechte</h3>
<p>Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO) und Datenübertragbarkeit (Art. 20 DSGVO). Soweit eine Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO beruht, können Sie ihr aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO). Wenden Sie sich dazu einfach an die oben genannte Kontaktadresse.</p>
<p>Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO), zum Beispiel bei der Landesbeauftragten für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover.</p>

<p>Stand: Oktober 2026</p>`;

export const LEGAL_PAGES = {
  impressum: { label: 'Impressum', doc: 'paas_config/impressum', fallback: DEFAULT_IMPRESSUM_HTML },
  datenschutz: { label: 'Datenschutz', doc: 'paas_config/datenschutz', fallback: DEFAULT_DATENSCHUTZ_HTML },
};

export const loadLegalText = async (key) => {
  const page = LEGAL_PAGES[key];
  try {
    const data = await readDoc(page.doc);
    const html = data?.html;
    return typeof html === 'string' && html.trim() ? html : page.fallback;
  } catch (err) {
    console.warn(`${page.label} nicht ladbar — nutze Standardtext:`, err);
    return page.fallback;
  }
};

// Nur im Editor genutzt — das SDK wird erst hier nachgeladen, damit die
// Website es nie lädt.
export const saveLegalText = async (key, html) => {
  const [{ doc, setDoc, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('./firebase.js'),
  ]);
  return setDoc(doc(db, LEGAL_PAGES[key].doc), { html, updatedAt: serverTimestamp() }, { merge: true });
};
