# Bilder-Zuordnungsplan — Paasleben

Status: Vorschlag / Platzhalter. Nichts am Website-Code wurde verändert.
Alle Texte sind Beispieltexte — keine konkreten Behauptungen.

---

## Webseiten-Kontext (kurz)

- Vite-Projekt, 3D-Splat-Viewer + interaktive Marker (Standpunkte 01–11+) auf einer Karte.
- Aktuell zeigt das Standpunkt-Panel (`paas-panel.js`) bei `data.image: null` lediglich einen Platzhalter ("BILD · …"). Die Logik unterstützt aber bereits ein einzelnes Bild via `<img src="${data.image}">`.
- Es gibt darüber hinaus keine weiteren Bildflächen in der Website. (Hero, Galerie, Über-uns etc. existieren nicht.)
- Statische Assets liegen unter `public/`. Bildvorschläge wurden daher nach `public/images/<kategorie>/` einsortiert.

---

## Marker-Mapping (aus `main.js`, `MARKER_NAME_OVERRIDES`)

| Marker | Name in App   | Vorschlag-Bilder                                  |
| :----- | :------------ | :------------------------------------------------ |
| 01     | Turm          | `umgebung/turm-regenbogen.jpg`                    |
| 02     | Trafo-Haus    | `trafohaus/trafohaus-essbereich.jpg`              |
| 03     | Frauen-Haus   | (offen — kein eindeutiger Bildordner; Vorschläge unten) |
| 05     | Teich-Haus    | `areal/teichhaus-tisch-mahlzeit.jpg`              |
| 11     | Storchen-Turm | `skulpturen/storchen-turm-skulptur.jpg`           |
| sonst  | Auto-Name     | freie Auswahl (siehe Kategorien unten)            |

---

## Übernommene Bilder (Quelle → Ziel)

Alle Originaldateien bleiben unverändert in `Paasleben-Bilder/`. Es werden **Kopien** in
`public/images/` mit web-freundlichen Dateinamen abgelegt.

### Areal / Hero / Ankommen

| Quelle                                  | Ziel                                            | Begründung                                            | Quelle der Einschätzung |
| :-------------------------------------- | :---------------------------------------------- | :---------------------------------------------------- | :---------------------- |
| Areal Stimmung/DSC_0322.JPG             | areal/areal-stimmung-sonne-skulptur.jpg         | Sonnenstand, Skulptur, weiße Tücher, Korbsessel; Stimmung | Bildanalyse             |
| Areal Stimmung/DSC_0463.JPG             | areal/atmosphere-fenster-haus.jpg               | Innenraum + Fensterblick auf Backsteingebäude          | Bildanalyse             |
| Umgebung/4 Regenbogen Turm Rad.JPG      | areal/turm-regenbogen.jpg                       | Backsteinturm + Regenbogen + Skulpturen-Rad            | Bildanalyse             |
| Umgebung/3Piazza grün.JPG               | areal/piazza-gruen-baumallee.jpg                | Übersicht Piazza, Baumreihe, "Q"-Skulptur              | Bildanalyse             |

### Badehaus (Innen / Stillleben / Picknick)

| Quelle                       | Ziel                                | Begründung                                  | Quelle |
| :--------------------------- | :---------------------------------- | :------------------------------------------ | :----- |
| Badehaus/7 Badehaus.jpg      | badehaus/badehaus-wohnraum.jpg      | Wohnraum mit Holzbalken & Kunst              | Bildanalyse |
| Badehaus/IMG_8087.JPG        | badehaus/badehaus-loft-treppe.jpg   | Loft, Mezzanin, Holzleiter, Sofas            | Bildanalyse |
| Badehaus/IMG_8714.JPG        | badehaus/badehaus-lounge.jpg        | Lounge mit pinkem & weißem Sofa, Kissen      | Bildanalyse |
| Badehaus/IMG_8072.JPG        | badehaus/badehaus-stillleben.jpg    | Stillleben Bild + Wein + Wildblumen          | Bildanalyse (rotiert!) |
| Badehaus/IMG_5153.jpg        | areal/picknick-tisch-hund.jpg       | Sommerlich gedeckter Picknick-Tisch + Hund   | Bildanalyse |
| Badehaus/IMG_8672.JPG        | areal/teichhaus-tisch-mahlzeit.jpg  | Tisch am Wasser mit Brot, Gemüse, Bierglas   | Bildanalyse |

### Trafohaus

| Quelle                  | Ziel                                       | Begründung                                  | Quelle |
| :---------------------- | :----------------------------------------- | :------------------------------------------ | :----- |
| Trafohaus/7 Trafohaus 2.jpg | trafohaus/trafohaus-essbereich.jpg     | Hoher Raum mit Glastisch + Skulptur          | Bildanalyse |
| Trafohaus/IMG_0388.JPG  | trafohaus/trafohaus-kueche-kupfer.jpg      | Kupferpfannen + Fensterblick (rotiert!)      | Bildanalyse |
| Trafohaus/IMG_0397.JPG  | trafohaus/trafohaus-leuchter-glas.jpg      | Bunter Glas-Leuchter + blaues Sofa (rotiert!) | Bildanalyse |

### Stall

| Quelle                  | Ziel                            | Begründung                                  | Quelle |
| :---------------------- | :------------------------------ | :------------------------------------------ | :----- |
| Stall/L1100966.JPG      | stall/stall-gasse.jpg           | Stallgasse, leere Boxen, Holz                | Bildanalyse |
| Stall/L1100971.JPG      | stall/stall-weitwinkel.jpg      | Großzügiger Reitstall, Heuballen, Tageslicht (Schatten Fotograf, kein erkennbares Gesicht) | Bildanalyse |

### Loft

| Quelle                  | Ziel                                  | Begründung                                  | Quelle |
| :---------------------- | :------------------------------------ | :------------------------------------------ | :----- |
| Loft/L1030532.JPG       | loft/loft-treppe-silhouette.jpg       | Treppe + abstrakte Lichtsilhouette-Kunst (kein Foto realer Person) (rotiert!) | Bildanalyse |

### Skulpturen / Garten

| Quelle                          | Ziel                                            | Begründung                                  | Quelle |
| :------------------------------ | :---------------------------------------------- | :------------------------------------------ | :----- |
| Skulpturen/L1100875.JPG         | skulpturen/skulptur-rad.jpg                     | Großes rostiges Eisenrad + Holzstapel        | Bildanalyse |
| Skulpturen/L1100884.JPG         | skulpturen/skulptur-buch-pfauen.jpg             | "Aufgeschlagenes Buch" als Cor-Ten-Skulptur, Pfauen | Bildanalyse |
| Skulpturen/L1100897.JPG         | skulpturen/skulptur-saeulen.jpg                 | Säulen-Ensemble mit Eisenrad                 | Bildanalyse |
| Umgebung/12 Schornstein QUER.JPG| skulpturen/schornstein-sonnenuntergang.jpg      | Schornstein + Skulptur-Silhouette / Abendrot (rotiert!) | Bildanalyse |
| Umgebung/IMG_4248.JPG           | skulpturen/storchen-turm-skulptur.jpg           | Eisensäule mit Reisig-Krone (Storchennest-Skulptur) (rotiert!) | Bildanalyse / Dateiname-Vermutung |

### Umgebung / Landschaft / Tiere

| Quelle                        | Ziel                                  | Begründung                                  | Quelle |
| :---------------------------- | :------------------------------------ | :------------------------------------------ | :----- |
| Umgebung/Teich.JPG            | umgebung/teich-pferde.jpg             | Teich + Pferde + Spiegelung                  | Bildanalyse |
| Umgebung/Nandus.jpg           | umgebung/nandus-wiese.jpg             | Drei Nandus auf Wiese                        | Bildanalyse |
| Umgebung/Stute Fohlen Raps.JPG| umgebung/stute-fohlen-raps.jpg        | Stute mit Fohlen, Rapsfeld im Hintergrund    | Bildanalyse / Dateiname |
| LEICA/L1009313.JPG            | umgebung/ausblick-fenster-himmel.jpg  | Fensterausschnitt auf bewölkten Horizont     | Bildanalyse |

---

## Bewusst NICHT verwendete Bilder

### Personen sichtbar (oder Verdacht)

- `Areal Stimmung/IMG_2711.JPG` — kleine Figur am Klavier im Hintergrund, nicht eindeutig.
- `Loft/L1010143.JPG` — unklare Figur im Raum (vermutlich Skulptur, aber nicht sicher).
- `Skulpturen/L1100893.JPG` — winzige Figuren in der Tiefe, sicherheitshalber raus.
- `Sonstiges/Foto Stalldinner.JPG` — Dateiname legt Dinner mit Gästen nahe.
- `Badehaus/Picknick Teich.JPG`, `Rahmenprogramm Safari.JPG` — Eventfotos, vermutlich Personen.
- `Loft/Frühstück Dachterrasse.JPG`, `Umgebung/Strohballen Frühstück.JPG` — vermutlich Frühstücksszenen mit Gästen.
- `Umgebung/Til Pferd Landschaft.JPG` — Dateiname legt erkennbare Person ("Til" = Till Paas) nahe.

### Ungeeignet / Sonstige

- `Areal Stimmung/DSC_0481.JPG` — Schaufensterpuppe (oben ohne) + Chili — unkonventionelle Galerie-Stimmung, eher heikel als Web-Bild.
- `Areal Stimmung/Ersatz/*.HEIC` — Format nicht webfreundlich, ohne Konvertierung nicht direkt nutzbar.
- `Skulpturen/*.MP4`, `TEXAS/*.blend|*.mp4|*.svg` — keine Standbilder.
- `LEICA/*.DNG` — Rohformat.

### Nicht geprüft (sehr großer Restbestand)

- `Canon/*.JPG` (≈ 70 Bilder), Großteil von `LEICA/*.JPG` (≈ 110 Bilder), Großteil von `Skulpturen/*.JPG` (≈ 120 Bilder).
- Aus Zeit-/Risiko-Gründen wurde eine kleine kuratierte Auswahl getroffen. Du kannst aus den restlichen Sets später gezielt nachziehen — am besten Ordner für Ordner gegen die selben Personen-Kriterien prüfen.

---

## Beispieltexte (Vorschläge — nur Platzhalter)

Diese Texte sind **nicht** in den Code eingefügt (Code wurde nicht angefasst). Du kannst sie bei Bedarf später z. B. in `STORY_PARAGRAPHS` oder als Standpunkt-spezifische Texte übernehmen — oder eigene Formulierungen wählen.

### Allgemein / Hero

> Ein Ort zum Atmen. Ein Ort, an dem Skulpturen, Räume und Landschaft ineinandergreifen.

> Backstein, Stahl, Glas — und dazwischen ein Garten, der sich Zeit nimmt.

### Atmosphäre / Areal

> Wenn das Licht weicher wird, beginnen die Räume zu erzählen.

> Wege, Sichtachsen und Ruhepunkte — gemacht zum Verweilen.

### Standpunkt-Beispiele (frei austauschbar)

> Ein Raum, der mit dem Tageslicht arbeitet — tagsüber Werkstatt, abends Bühne für Gespräche.

> Stein, Holz, Wasser. Wenig Inszenierung, viel Aufmerksamkeit für das, was bleibt.

> Hier hat jede Skulptur ihren eigenen Horizont. Manche braucht ihn weit, andere nah.

### Vorgeschlagene deutsche Alt-Texte (Auswahl)

| Bild                                            | alt                                                                         |
| :---------------------------------------------- | :-------------------------------------------------------------------------- |
| areal/turm-regenbogen.jpg                       | Backsteinturm im Abendlicht, darüber ein Regenbogen am grauen Himmel         |
| areal/areal-stimmung-sonne-skulptur.jpg         | Sommerlich eingerichteter Außenbereich mit Skulptur in der Abendsonne        |
| areal/picknick-tisch-hund.jpg                   | Gedeckter Tisch mit blau-weißer Decke unter Bäumen, neben dem Tisch ein Hund |
| areal/teichhaus-tisch-mahlzeit.jpg              | Holztisch am Wasser mit Brot, Gemüse, Bierglas und Schneidebrett             |
| badehaus/badehaus-wohnraum.jpg                  | Heller Wohnraum mit Holzbalkendecke, pinkem Sofa und Kunstdrucken            |
| badehaus/badehaus-loft-treppe.jpg               | Loftraum mit Mezzanin, Holzleiter, pinkem Sofa und Bildersammlung            |
| badehaus/badehaus-lounge.jpg                    | Lounge mit pinkem und weißem Sofa, Vintage-Truhe als Couchtisch              |
| badehaus/badehaus-stillleben.jpg                | Stillleben aus Wildblumenstrauß, Weinflasche und gerahmtem Bild              |
| trafohaus/trafohaus-essbereich.jpg              | Hoher Raum im Trafohaus mit Glastisch, Skulptur und blauer Treppe            |
| trafohaus/trafohaus-kueche-kupfer.jpg           | Küchenbereich mit Reihe aufgehängter Kupferpfannen am Fenster                |
| trafohaus/trafohaus-leuchter-glas.jpg           | Bunter Glas-Leuchter über dunkelblauem Sofa unter einem Dachfenster          |
| stall/stall-gasse.jpg                           | Stallgasse mit hellen, geschlossenen Pferdeboxen und Tageslicht              |
| stall/stall-weitwinkel.jpg                      | Großzügiger Reitstall mit Heuballen und Glasdach                             |
| loft/loft-treppe-silhouette.jpg                 | Treppe mit hinterleuchteten Silhouette-Kunstpaneelen                         |
| skulpturen/skulptur-rad.jpg                     | Übergroßes rostiges Eisenrad als Skulptur, daneben Holzstapel                |
| skulpturen/skulptur-buch-pfauen.jpg             | "Aufgeschlagenes Buch"-Skulptur aus Cor-Ten-Stahl im Garten, Pfauen davor    |
| skulpturen/skulptur-saeulen.jpg                 | Reihe vertikaler Stahlskulpturen vor altem Backsteingebäude                  |
| skulpturen/schornstein-sonnenuntergang.jpg      | Schornstein und Skulptur als Silhouette vor orange-rosa Abendhimmel          |
| skulpturen/storchen-turm-skulptur.jpg           | Eisensäule mit Reisig-Krone, an Storchennest-Form erinnernd                  |
| umgebung/teich-pferde.jpg                       | Stiller Teich mit Pferden auf der gegenüberliegenden Wiese, Spiegelung       |
| umgebung/nandus-wiese.jpg                       | Drei Nandus auf einer Sommerwiese unter Wolkenhimmel                         |
| umgebung/stute-fohlen-raps.jpg                  | Stute mit Fohlen auf Frühlingswiese, im Hintergrund Baumreihe und Rapsfeld   |
| umgebung/ausblick-fenster-himmel.jpg            | Fensterblick auf weiten Horizont mit Wolkenhimmel und Baumlinie              |

---

## Unsicherheiten / Anmerkungen

1. **Drehung:** Mehrere iPhone-Aufnahmen (`IMG_0388`, `IMG_0397`, `IMG_8072`, `IMG_4248`, `12 Schornstein QUER`, `L1030532`) haben EXIF-Orientierung, die im Browser ggf. anders dargestellt wird, als Vorschau-Tools sie zeigen. Vor Einsatz im Web kurz im Browser prüfen, ggf. einmal neu speichern oder serverseitig drehen.
2. **Dateigrößen:** Die Originale sind 1–6 MB. Für eine schnelle Website empfiehlt sich eine zweite Pipeline (z. B. ImageMagick / Squoosh / Vite-Image-Plugin) zur Komprimierung & WebP-Erzeugung. Dieser Schritt wurde bewusst nicht durchgeführt, weil er Code-/Build-Konfiguration betrifft.
3. **Gerahmte Bilder im Innenraum:** In den Badehaus-Innenfotos hängen Warhol-/Marilyn-Drucke und gemalte Porträts an der Wand. Das sind Kunstwerke, keine Personenfotos im Sinne der Privatsphäre — bitte trotzdem prüfen, ob die Marilyn-Drucke aus Lizenz-Sicht ok sind, falls die Bilder öffentlich werden.
4. **Standpunkt 03 "Frauen-Haus":** Kein Ordner trägt diesen Namen. Bis zur Klärung sind Innenraum-Bilder aus `Loft` oder `Badehaus` mögliche Platzhalter — bitte intern bestätigen.
5. **Personen-Schatten** auf `Stall/L1100971.JPG`: nur Schatten auf dem Boden, kein Gesicht erkennbar. Falls trotzdem heikel, durch `L1100966.JPG` ersetzen.
6. **Großer Restbestand:** Aus `Canon/`, `LEICA/`, `Skulpturen/` wurde nur eine kleine Stichprobe geprüft. Wenn weitere Bilder gewünscht sind, gerne nachreichen — ich kann dieselben Kriterien anwenden.
