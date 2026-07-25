// Einstieg des Karten-Editors (/admin.html): Google-Login über Firebase Auth,
// Admin-Gate über die Firestore-Collection `paas_admins`, dann Editor-Start.
import './admin.css';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '../lib/firebase.js';
import { startEditor } from './editor.js';

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const loginScreen = document.querySelector('#login-screen');
const editorScreen = document.querySelector('#editor-screen');
const loginButton = document.querySelector('#login-button');
const loginStatus = document.querySelector('#login-status');
const logoutButton = document.querySelector('#logout-button');
const userChip = document.querySelector('#user-chip');

const showStatus = (msg) => {
  loginStatus.hidden = !msg;
  loginStatus.textContent = msg || '';
};

const isAdmin = async (user) => {
  if (!user?.email) return false;
  try {
    const snap = await getDoc(doc(db, 'paas_admins', user.email.toLowerCase()));
    return snap.exists();
  } catch (err) {
    console.warn('Admin-Prüfung fehlgeschlagen:', err);
    return false;
  }
};

let editorStarted = false;

// Dev-only: `?preview=1` startet den Editor ohne Login (nur lokaler
// Vite-Dev-Server; im Build wirkungslos). Schreibzugriffe scheitern dann
// an den Security Rules — gut zum Ausprobieren der Oberfläche.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('preview')) {
  userChip.textContent = 'Vorschau · nur Lesen';
  document.body.dataset.readonly = '1';
  loginScreen.hidden = true;
  editorScreen.hidden = false;
  editorStarted = true;
  startEditor();
  const banner = document.querySelector('#editor-banner');
  banner.textContent = 'Vorschau ohne Anmeldung — Änderungen werden nicht gespeichert '
    + 'und springen zurück. Zum Bearbeiten /admin.html ohne ?preview=1 öffnen und anmelden.';
  banner.className = 'editor-banner is-warn';
  banner.hidden = false;
}

onAuthStateChanged(auth, async (user) => {
  if (editorStarted && !user) return;
  if (!user) {
    loginScreen.hidden = false;
    editorScreen.hidden = true;
    return;
  }
  showStatus('Prüfe Berechtigung…');
  if (!(await isAdmin(user))) {
    showStatus(`${user.email} ist nicht als Editor freigeschaltet. `
      + 'Freischalten: Firebase-Konsole → Firestore → paas_admins → Dokument mit der E-Mail als ID anlegen.');
    await signOut(auth);
    return;
  }
  showStatus('');
  userChip.textContent = user.email;
  loginScreen.hidden = true;
  editorScreen.hidden = false;
  if (!editorStarted) {
    editorStarted = true;
    startEditor();
  }
});

loginButton.addEventListener('click', async () => {
  showStatus('Anmeldefenster geöffnet…');
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    showStatus(`Anmeldung fehlgeschlagen: ${err.code || err.message}`);
  }
});

logoutButton.addEventListener('click', () => signOut(auth));
