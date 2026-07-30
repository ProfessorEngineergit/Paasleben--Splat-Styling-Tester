// Geführte Kurzeinführung im Editor, erreichbar über den „?“-Knopf oben rechts.
//
// Gedacht für Maren und alle, die den Editor zum ersten Mal öffnen. Der
// wichtigste Punkt, den die Tour erklärt, ist das automatische Speichern: es
// gibt bewusst keinen Speichern-Knopf, und genau das verunsichert Menschen, die
// es anders gewohnt sind.
//
// Bewusst ohne Fremdbibliothek und ohne Eingriff in die Editor-Logik: die Tour
// legt nur ein Overlay über die Seite, hebt ein vorhandenes Element hervor und
// verändert nichts an den Daten.

const STORAGE_KEY = 'paas-tour-gesehen';

// Jeder Schritt zeigt auf ein Element, das es im Editor schon gibt. Fehlt eines
// (etwa weil kein Ort ausgewählt ist), wird der Schritt übersprungen.
const STEPS = [
  {
    selector: '#location-list',
    title: 'Die Orte',
    text: 'Alle Orte der Karte auf einen Blick. Klicke einen an — oder direkt sein Schild auf der Karte —, um ihn zu bearbeiten. Über das Suchfeld darüber findest du bei vielen Orten schneller den richtigen.',
  },
  {
    selector: '#add-point-button',
    title: 'Neuen Ort anlegen',
    text: 'Erst hier klicken, dann auf die Stelle der Karte, an die der neue Ort gehört. Mit Esc brichst du ab, falls du dich verklickst.',
  },
  {
    selector: '#f-title',
    title: 'Texte ändern',
    text: 'Titel, Untertitel und Beschreibung stehen genau so auf der Website. Schreib einfach los.',
  },
  {
    selector: '#save-status',
    title: 'Speichern passiert von selbst',
    text: 'Es gibt keinen Speichern-Knopf. Sobald du ein Feld verlässt, ist die Änderung gesichert — hier erscheint dann kurz „Gespeichert ✓“. Deine Änderungen sind sofort auf der Website sichtbar.',
    fallbackSelector: '#location-form',
  },
  {
    selector: '#open-library',
    title: 'Fotos zuordnen',
    text: 'Aus der Bibliothek wählen oder eigene Fotos hochladen. Bereits verwendete Bilder sind mit einem Häkchen markiert. Die Reihenfolge kannst du danach mit den Pfeilen ändern.',
    fallbackSelector: '#image-list',
  },
  {
    selector: '#f-visible',
    title: 'Ort vorübergehend ausblenden',
    text: 'Häkchen weg heißt: der Ort verschwindet von der Website, bleibt hier aber erhalten. Praktisch für alles, was noch nicht fertig ist.',
  },
  {
    selector: '#theme-select',
    title: 'Das Design wählen',
    text: 'Hier schaltest du zwischen den Design-Varianten um. Die Auswahl gilt für die ganze Website und wirkt sofort für alle Besucher — du kannst also gefahrlos vergleichen und jederzeit zurück.',
  },
  {
    selector: '#preview-location',
    title: 'So sieht es später aus',
    text: 'Die End-Ansicht öffnet die echte Website in einem Fenster. Titel und Texte lassen sich dort direkt anklicken und ändern.',
    fallbackSelector: '#location-form',
  },
];

// Liefert das Element nur, wenn es wirklich dargestellt wird. Reine Existenz
// im DOM genügt nicht: das Ort-Formular ist vorhanden, solange kein Ort gewählt
// ist aber `hidden` — der Hervorhebungsring wäre dann 0×0 groß in der linken
// oberen Ecke.
const sichtbar = (selector) => {
  if (!selector) return null;
  const el = document.querySelector(selector);
  return el && el.getClientRects().length ? el : null;
};

export const setupTour = () => {
  const button = document.querySelector('#tour-button');
  if (!button) return;

  let overlay = null;
  let steps = [];
  let index = 0;
  let onKey = null;

  const cleanup = () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    overlay?.remove();
    overlay = null;
    button.classList.remove('is-neu');
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Privater Modus — dann wird der Hinweis eben wieder angeboten.
    }
  };

  // Hebt das Element des aktuellen Schritts hervor und setzt die Sprechblase
  // darunter oder darüber, je nachdem wo Platz ist.
  function place() {
    if (!overlay) return;
    const step = steps[index];
    const target = sichtbar(step.selector) || sichtbar(step.fallbackSelector);
    const ring = overlay.querySelector('.tour-ring');
    const card = overlay.querySelector('.tour-card');
    if (!target) {
      // Kein Ziel sichtbar: Karte zentriert zeigen, ohne Hervorhebung.
      ring.style.display = 'none';
      card.style.left = '50%';
      card.style.top = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    ring.style.display = '';
    ring.style.left = `${r.left - pad}px`;
    ring.style.top = `${r.top - pad}px`;
    ring.style.width = `${r.width + pad * 2}px`;
    ring.style.height = `${r.height + pad * 2}px`;

    const below = r.bottom + 16;
    const fitsBelow = below + card.offsetHeight < window.innerHeight - 8;
    card.style.transform = 'none';
    card.style.top = fitsBelow ? `${below}px` : `${Math.max(8, r.top - card.offsetHeight - 16)}px`;
    card.style.left = `${Math.min(
      Math.max(8, r.left),
      Math.max(8, window.innerWidth - card.offsetWidth - 8),
    )}px`;
  }

  const render = () => {
    const step = steps[index];
    overlay.querySelector('.tour-step').textContent = `Schritt ${index + 1} von ${steps.length}`;
    overlay.querySelector('.tour-title').textContent = step.title;
    overlay.querySelector('.tour-text').textContent = step.text;
    overlay.querySelector('.tour-back').disabled = index === 0;
    overlay.querySelector('.tour-next').textContent = index === steps.length - 1 ? 'Fertig' : 'Weiter';
    // Direkt nach dem Füllen platzieren, nicht über requestAnimationFrame:
    // in einem Hintergrund-Tab läuft rAF nicht, die Sprechblase bliebe dann
    // beim ersten Schritt stehen. Das Auslesen von offsetHeight in place()
    // erzwingt das Layout, die Höhe stimmt also auch synchron.
    place();
  };

  const start = () => {
    if (overlay) return;
    // Schritte ohne sichtbares Ziel überspringen. Wer die Tour ohne gewählten
    // Ort startet, bekommt so nur die Schritte, die er auch nachvollziehen kann
    // — und die Nummerierung passt zur tatsächlichen Länge.
    steps = STEPS.filter((s) => sichtbar(s.selector) || sichtbar(s.fallbackSelector));
    if (!steps.length) return;
    index = 0;

    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.innerHTML = `
      <div class="tour-ring" aria-hidden="true"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-label="Kurzeinführung">
        <p class="tour-step"></p>
        <h2 class="tour-title"></h2>
        <p class="tour-text"></p>
        <div class="tour-actions">
          <button type="button" class="btn btn-quiet tour-skip">Überspringen</button>
          <span class="tour-spacer"></span>
          <button type="button" class="btn tour-back">Zurück</button>
          <button type="button" class="btn btn-primary tour-next">Weiter</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.tour-skip').addEventListener('click', cleanup);
    overlay.querySelector('.tour-back').addEventListener('click', () => {
      if (index > 0) { index -= 1; render(); }
    });
    overlay.querySelector('.tour-next').addEventListener('click', () => {
      if (index < steps.length - 1) { index += 1; render(); } else cleanup();
    });
    // Klick auf den abgedunkelten Hintergrund beendet die Tour; Klicks in der
    // Karte nicht.
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    onKey = (e) => {
      if (e.key === 'Escape') cleanup();
      if (e.key === 'ArrowRight') overlay?.querySelector('.tour-next').click();
      if (e.key === 'ArrowLeft') overlay?.querySelector('.tour-back').click();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    render();
  };

  button.addEventListener('click', start);

  // Beim allerersten Öffnen dezent auf die Tour hinweisen, statt sie
  // aufzuzwingen — der Knopf pulsiert, bis er einmal benutzt wurde.
  try {
    if (!localStorage.getItem(STORAGE_KEY)) button.classList.add('is-neu');
  } catch {
    // ignorieren
  }
};
