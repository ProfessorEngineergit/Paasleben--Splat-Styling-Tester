# PAASLEBEN — Interaktive Splat-Karte

3D-Rundgang über das Areal PAASLEBEN (Tier- und Skulpturenpark, Coaching
Campus): eine Gaussian-Splat-Szene (`public/scene.ksplat`) mit klickbaren
Orts-Schildern. Jedes Schild öffnet ein Panel mit Texten und Fotos.

**Inhalte (Orte, Texte, Fotos) liegen in Firebase/Firestore** und werden über
den eingebauten Karten-Editor gepflegt — Änderungen sind sofort live, ohne
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
- **Navigation:** frei und schnell — Maus (drehen/zoomen/verschieben),
  **W A S D** fliegen, **Q/E** hoch/runter, **Shift** = Turbo, Knopf
  „Draufsicht" für die Vogelperspektive.
- **Orte:** „＋ Neuer Ort" und auf die Karte klicken; verschieben per
  Ziehen des Schilds, per **Gizmo-Pfeilen** (X/Y/Z, wie in Shapr3D) oder
  Pfeiltasten (Shift = grob); Titel/Untertitel/Text/Schild-Nr./Sichtbarkeit
  im Formular; Position auch numerisch; „Duplizieren" für ähnliche Punkte.
- **End-Ansicht:** Knopf im Formular öffnet die echte Website-Ansicht des
  Ortes — Titel, Untertitel und Text sind dort direkt anklick- und
  editierbar (automatisch gespeichert). Bearbeiten geht wahlweise dort
  oder im Formular.
- **Fotos:** eigene Uploads (werden clientseitig verkleinert und in Firestore
  gespeichert — kein Firebase-Storage/Blaze-Tarif nötig) oder Fotos aus der
  Bibliothek: **alle** Dateien unter `public/images/**` erscheinen
  automatisch (neue Bilder einfach in den Ordner legen und committen).
  Reihenfolge, Alt-Texte, Löschen im Editor.
- Neue Orte starten **ausgeblendet** — erst „Sichtbar" anhaken, wenn fertig.
- Deep-Link: `/?ort=08` öffnet die Website direkt an einem Standpunkt.

## Datenhaltung (Firebase-Projekt `tasks-4182a`)

| Collection | Inhalt | Zugriff |
|---|---|---|
| `paas_locations` | ein Dokument je Ort (Titel, Texte, Position, Bilderliste) | lesen: alle · schreiben: Admins |
| `paas_images` | hochgeladene Fotos als Base64 (max. ~900 KB) | lesen: alle · schreiben: Admins |
| `paas_admins` | Editor-Berechtigungen (Doc-ID = E-Mail) | nur Firebase-Konsole |

Security Rules: `firestore.rules` (deployen mit
`firebase deploy --only firestore:rules`). Das Projekt beherbergt auch andere
Apps — die Zonen-Aufteilung (`cq_*`, `paas_*`, Rest) in den Rules unbedingt
erhalten.

Nützliche Skripte in `tools/`:

- `node tools/export-snapshot.mjs` — zieht den aktuellen Firestore-Stand als
  Offline-Fallback nach `src/data/locations-snapshot.json` (gelegentlich nach
  größeren Inhaltsänderungen ausführen und committen).
- `node tools/migrate-to-firestore.mjs` — einmalige Erst-Migration (bereits
  gelaufen; überschreibt Firestore mit dem Alt-Stand — nur bewusst nutzen).

## Deployment

Zwei GitHub-Actions-Workflows, beide bei Push auf `main`:

1. **GitHub Pages** (`.github/workflows/deploy.yml`) — läuft ohne weitere
   Einrichtung, Basis-Pfad `/<repo>/`.
2. **IONOS** (`.github/workflows/deploy-ionos.yml`) — lädt den Build per
   SFTP auf den IONOS-Webspace, Basis-Pfad `/`.

## Übergabe an die IT / IONOS

Für den automatischen IONOS-Deploy müssen einmalig **drei Secrets** im
GitHub-Repo hinterlegt werden — mehr nicht:

1. GitHub → Repo → **Settings → Secrets and variables → Actions →
   „New repository secret"** und diese drei Einträge anlegen:

   | Name | Wert (aus dem IONOS-Konto) |
   |---|---|
   | `IONOS_SFTP_HOST` | SFTP-Host (SSH, Port 22), z. B. `homeXXXXXXXXX.1and1-data.host` |
   | `IONOS_SFTP_USER` | SFTP-Benutzer des Webspace, z. B. `accXXXXXXXXXX` |
   | `IONOS_SFTP_PASSWORD` | zugehöriges Passwort |

   (IONOS: Menü **Hosting → SFTP & SSH** — dort stehen Host und Benutzer;
   Passwort ggf. neu setzen. Der Deploy nutzt SFTP über SSH auf Port 22.)

2. Danach im Repo unter **Actions → „Deploy to IONOS" → „Run workflow"**
   einmal manuell starten und prüfen, dass der Lauf grün wird. Ab dann
   deployt jeder Push auf `main` automatisch.

3. In der **Firebase-Konsole** (Projekt `tasks-4182a` → Authentication →
   Settings → Authorized domains) die endgültige IONOS-Domain eintragen,
   sonst funktioniert der Editor-Login auf dieser Domain nicht.

Der Webspace braucht keinerlei Server-Software — es sind statische Dateien.
Die Inhalte der Karte kommen zur Laufzeit aus Firebase; dafür ist **kein**
IONOS-Zugriff nötig, die Pflege bleibt vollständig beim Betreiber über
`https://<domain>/admin.html`.

## Struktur

```
index.html, src/main.js        Viewer (Splat, Schilder, Panels)
admin.html, src/admin/         Karten-Editor (Auth, 3D-Editing, Fotos)
src/lib/firebase*.js           Firebase-Init + Web-Config (öffentlich)
src/lib/locations.js           Daten-Layer (Firestore + Snapshot-Fallback)
src/lib/splat-alignment.js     gemeinsame Splat-Ausrichtung Viewer/Editor
src/data/                      Snapshot-Fallback + Foto-Bibliothek (generiert)
public/scene.ksplat            Splat-Szene · public/Paasleben.glb: Ausrichtung
public/images/                 statische Foto-Bibliothek
firestore.rules, firebase.json Security Rules / Firebase-Projektconfig
tools/                         Migrations-/Export-Skripte (Node)
```
