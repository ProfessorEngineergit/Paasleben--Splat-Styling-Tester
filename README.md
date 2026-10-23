# PAASLEBEN - Interaktive Splat-Karte

3D-Rundgang über das Areal PAASLEBEN (Tier- und Skulpturenpark, Coaching
Campus): eine Gaussian-Splat-Szene (`public/scene.ksplat`) mit klickbaren
Orts-Schildern. Jedes Schild öffnet ein Panel mit Texten und Fotos.

**Inhalte (Orte, Texte, Fotos) liegen in Firebase/Firestore** und werden über
den eingebauten Karten-Editor gepflegt - Änderungen sind sofort live, ohne
neues Deployment. Der Code (dieses Repo) wird bei jedem Push auf `main`
automatisch zu GitHub Pages und zu IONOS deployt.

## Entwicklung

```bash
npm install
npm run dev      # http://localhost:5173  (Viewer)
                 # http://localhost:5173/admin.html  (Editor)
npm run build    # Produktions-Build (Viewer + Editor) nach dist/
```

## Karten-Editor (/admin.html)

- **Login:** Google-Konto (Firebase Auth). Schreiben darf nur, wessen E-Mail
  als Dokument-ID in der Firestore-Collection `paas_admins` steht
  (Firebase-Konsole → Firestore → `paas_admins` → Dokument anlegen,
  ID = E-Mail in Kleinbuchstaben).
- **Navigation:** links ziehen bzw. 1 Finger = verschieben; rechts ziehen bzw.
  2 Finger = drehen; Rad, Trackpad oder Pinch = Map zoomen;
  **W A S D** fliegen, **Q/E** hoch/runter, **Shift** = Turbo, Knopf
  „Draufsicht" für die Vogelperspektive.
- **Historie:** „Rückgängig" / „Wiederholen" oben im Editor oder
  **⌘/Ctrl+Z** und **⇧⌘/Ctrl+Z**. Erfasst Texte, Positionen, Sichtbarkeit,
  Fotos, neue/gelöschte Orte und Designwechsel.
- **Orte:** „＋ Neuer Ort" und auf die Karte klicken; verschieben per
  Ziehen des Schilds, per **Gizmo-Pfeilen** (X/Y/Z, wie in Shapr3D) oder
  Pfeiltasten (Shift = grob); Titel/Untertitel/Text/Schild-Nr./Sichtbarkeit
  im Formular; Position auch numerisch; „Duplizieren" für ähnliche Punkte.
- **End-Ansicht:** Knopf im Formular öffnet die echte Website-Ansicht des
  Ortes - Titel, Untertitel und Text sind dort direkt anklick- und
  editierbar (automatisch gespeichert). Bearbeiten geht wahlweise dort
  oder im Formular.
- **Fotos:** eigene Uploads werden clientseitig verkleinert, per SHA-256
  dedupliziert und dauerhaft in der gemeinsamen Firestore-Bibliothek
  gespeichert (kein Firebase-Storage/Blaze-Tarif nötig). Identische Dateien,
  die bereits unter `public/images/**` liegen, werden direkt wiederverwendet.
  Alle statischen und hochgeladenen Bibliotheksbilder können an mehreren Orten
  eingesetzt werden. Reihenfolge und Alt-Texte bleiben je Ort separat.
  iPhone-Fotos (HEIC/HEIF) werden automatisch nach JPEG umgewandelt
  (Konverter wird nur bei Bedarf nachgeladen); der Upload klappt auch über
  `http://`, Fehler werden je Datei angezeigt.
- **Video:** Feld „Hintergrundvideo" je Ort (Pfad unter `public/videos/`,
  z. B. `videos/porsche.mp4`, oder volle URL zu einer `.mp4`) ersetzt die
  Fotos. Die Checkbox „Video-Platzhalter" zeigt bis dahin den Videorahmen mit
  dem ersten Foto und „Film folgt in Kürze". Orte mit Video oder Platzhalter
  erscheinen als breites Banner (siehe [Video einbinden](#video-einbinden)).
- **Website-Texte:** Knopf oben im Editor, mit den Reitern **Kopfbereich**
  (Texte oben links), **Gastgeber** (Profile samt Kontaktdaten und die
  allgemeine Kontakt-E-Mail, Standard `kontakt@paasleben.com`),
  **Impressum** und **Datenschutz**.
- Neue Orte starten **ausgeblendet** - erst „Sichtbar" anhaken, wenn fertig.
- Deep-Link: `/?ort=08` öffnet die Website direkt an einem Standpunkt.

## Datenhaltung (Firebase-Projekt `tasks-4182a`)

| Collection | Inhalt | Zugriff |
|---|---|---|
| `paas_locations` | ein Dokument je Ort (Titel, Texte, Position, Bilderliste) | lesen: alle · schreiben: Admins |
| `paas_images` | hochgeladene Fotos als Base64 (max. ~900 KB) | lesen: alle · schreiben: Admins |
| `paas_admins` | Editor-Berechtigungen (Doc-ID = E-Mail) | nur Firebase-Konsole |
| `paas_config/site` | gewähltes Design (Theme) | lesen: alle · schreiben: Admins |
| `paas_config/content` | Website-Texte: Kopfbereich, Kontakt-E-Mail, Gastgeber | lesen: alle · schreiben: Admins |
| `paas_config/impressum` | Impressum (HTML) | lesen: alle · schreiben: Admins |
| `paas_config/datenschutz` | Datenschutzerklärung (HTML) | lesen: alle · schreiben: Admins |
| `paas_config/migrations` | erledigte Inhalts-Updates (Feld `applied`) | lesen: alle · schreiben: Admins |

Die öffentliche Website liest Firestore per REST-API
(`src/lib/firestore-rest.js`), ohne Firebase-SDK - rund 600 KB weniger
JavaScript und nichts im Browser der Besucher gespeichert. Das SDK wird nur im
Editor geladen.

Security Rules: `firestore.rules` (deployen mit
`firebase deploy --only firestore:rules`). Das Projekt beherbergt auch andere
Apps - die Zonen-Aufteilung (`cq_*`, `paas_*`, Rest) in den Rules unbedingt
erhalten.

Nützliche Skripte in `tools/`:

- `node tools/export-snapshot.mjs` - zieht den aktuellen Firestore-Stand als
  Offline-Fallback nach `src/data/locations-snapshot.json` (gelegentlich nach
  größeren Inhaltsänderungen ausführen und committen).
- `node tools/migrate-to-firestore.mjs` - einmalige Erst-Migration (bereits
  gelaufen; überschreibt Firestore mit dem Alt-Stand - nur bewusst nutzen).

## Inhalts-Updates (Migrationen)

Manche Änderungen an der Inhaltsstruktur (neue Orte, Umnummerierungen) kommen
mit dem Code, müssen aber in Firestore geschrieben werden - und das darf nur
ein angemeldeter Admin. Deshalb:

1. Nach dem Deploy einmal `/admin.html` öffnen und anmelden.
2. Offene Updates laufen automatisch, jeweils in einer Firestore-Transaktion
   und genau einmal (erledigte IDs in `paas_config/migrations`). Das Banner
   „Inhalte aktualisiert: …" bestätigt es.

Aktuell: `src/admin/migrations/2026-10-willkommen.js` teilt „Willkommen" in
Willkommen (mit Gastgebern und Video-Platzhalter) und „Geschichte" (Nr. 02),
rückt die folgenden Orte eine Nummer weiter und legt „Nandu-Weide" und
„Skulpturen" an.

Neues Update anlegen: Datei in `src/admin/migrations/`, die eine eindeutige
`ID` und eine reine Funktion `plan(locations)` exportiert (liefert
`{ updates, creates, summary }`, ohne Firestore-Zugriff), und in
`src/admin/migrations.js` in `MIGRATIONS` eintragen.

## Datenschutz-Technik

- Die öffentliche Website setzt **keine Cookies** und speichert nichts im
  Browser (kein localStorage, keine IndexedDB).
- Schriften liegen lokal im Build (`@fontsource`, `src/styles/fonts.css`),
  kein Google Fonts.
- Einzige externe Anfrage: `firestore.googleapis.com` (REST, Inhalte).
- `http://` wird auf echten Domains per JavaScript auf `https://` umgeleitet
  (`index.html`, `admin.html`).
- Wird etwas Neues eingebunden (z. B. YouTube, Statistik/Analytics), muss die
  Datenschutzerklärung im Editor (Website-Texte → Datenschutz) angepasst
  werden.
- **Hinweis:** Impressum und Datenschutzerklärung (Startwerte in
  `src/lib/legal.js`) sind ein Entwurf und müssen rechtlich geprüft werden.

## Video einbinden

1. Videodatei nach `public/videos/` legen (Ordner bei Bedarf anlegen).
   Empfehlung: MP4 (H.264), ca. 1080p, möglichst unter ~20 MB - GitHub
   erlaubt höchstens 100 MB pro Datei.
2. Committen und pushen (Deploy läuft automatisch).
3. Im Editor beim Ort „Willkommen" ins Feld „Hintergrundvideo" z. B.
   `videos/porsche.mp4` eintragen. Das Video ersetzt dann den Platzhalter
   und läuft stumm in Schleife.

## Deployment

Zwei GitHub-Actions-Workflows, beide bei Push auf `main`:

1. **GitHub Pages** (`.github/workflows/deploy.yml`) - läuft ohne weitere
   Einrichtung, Basis-Pfad `/<repo>/`.
2. **IONOS** (`.github/workflows/deploy-ionos.yml`) - lädt den Build per
   SFTP auf den IONOS-Webspace, Basis-Pfad `/`.

## Übergabe an die IT / IONOS

Für den automatischen IONOS-Deploy müssen einmalig **drei Secrets** im
GitHub-Repo hinterlegt werden - mehr nicht:

1. GitHub → Repo → **Settings → Secrets and variables → Actions →
   „New repository secret"** und diese drei Einträge anlegen:

   | Name | Wert (aus dem IONOS-Konto) |
   |---|---|
   | `IONOS_SFTP_HOST` | SFTP-Host (SSH, Port 22), z. B. `homeXXXXXXXXX.1and1-data.host` |
   | `IONOS_SFTP_USER` | SFTP-Benutzer des Webspace, z. B. `accXXXXXXXXXX` |
   | `IONOS_SFTP_PASSWORD` | zugehöriges Passwort |

   (IONOS: Menü **Hosting → SFTP & SSH** - dort stehen Host und Benutzer;
   Passwort ggf. neu setzen. Der Deploy nutzt SFTP über SSH auf Port 22.)

2. Danach im Repo unter **Actions → „Deploy to IONOS" → „Run workflow"**
   einmal manuell starten und prüfen, dass der Lauf grün wird. Ab dann
   deployt jeder Push auf `main` automatisch.

3. In der **Firebase-Konsole** (Projekt `tasks-4182a` → Authentication →
   Settings → Authorized domains) die endgültige IONOS-Domain eintragen,
   sonst funktioniert der Editor-Login auf dieser Domain nicht.

Der Webspace braucht keinerlei Server-Software - es sind statische Dateien.
Die Inhalte der Karte kommen zur Laufzeit aus Firebase; dafür ist **kein**
IONOS-Zugriff nötig, die Pflege bleibt vollständig beim Betreiber über
`https://<domain>/admin.html`.

## Struktur

```
index.html, src/main.js        Viewer (Splat, Schilder, Panels)
admin.html, src/admin/         Karten-Editor (Auth, 3D-Editing, Fotos)
src/admin/migrations*          einmalige Inhalts-Updates (siehe oben)
src/lib/firebase*.js           Firebase-Init (SDK, nur Editor) + Web-Config (öffentlich)
src/lib/firestore-rest.js      lesender Firestore-Zugriff der Website (REST)
src/lib/locations.js           Daten-Layer (Firestore + Snapshot-Fallback)
src/lib/site-content.js        Website-Texte (Kopfbereich, Kontakt, Gastgeber)
src/lib/legal.js               Impressum + Datenschutzerklärung (Startwerte)
src/styles/fonts.css           lokal ausgelieferte Schriften (@fontsource)
src/lib/splat-alignment.js     gemeinsame Splat-Ausrichtung Viewer/Editor
src/data/                      Snapshot-Fallback + Foto-Bibliothek (generiert)
public/scene.ksplat            Splat-Szene · public/Paasleben.glb: Ausrichtung
public/images/                 statische Foto-Bibliothek
firestore.rules, firebase.json Security Rules / Firebase-Projektconfig
tools/                         Migrations-/Export-Skripte (Node)
```

## KI-Beteiligung

Einzelne Code-Beiträge sind ausdrücklich KI-Tools zugeschrieben: [generated with Claude Code](https://github.com/ProfessorEngineergit/Paasleben--Splat-Styling-Tester/commit/3be97c6a8a05a268e65fa401e6ec043b3e06e3b1). Das gilt für diese Beiträge, nicht pauschal für alle Dateien.
