// Vögel über dem Areal, für die Draufsicht.
//
// Auf dem Gelände leben Störche, Pfauen und Nandus — von oben ist das der
// Blick, den man aus deren Höhe hätte. Statt einer Wolkendecke ziehen deshalb
// ein paar Silhouetten durchs Bild.
//
// Bewusst ein Overlay-Canvas über dem WebGL-Canvas und keine Geometrie in der
// Splat-Szene: Die Szene rendert die Gaussian-Splat-Bibliothek, ihr Material
// schreibt keine Tiefe, und eigene Meshes dort einzuhängen hat sich als der
// Weg erwiesen, auf dem die Darstellung kippt. Ein Overlay kann das nicht.

const REDUZIERT = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Ein Storch von oben. Charakteristisch ist nicht das Möwen-V, sondern das
// Kreuz: langer gestreckter Hals nach vorn, ebenso lange Beine nach hinten,
// und quer dazu die breiten Flügel. Genau daran erkennt man ihn aus der Höhe.
//
// `richtung` zeigt in Flugrichtung (+x ist vorn), `schlag` läuft von 0
// (gestreckt) bis 1 (angewinkelt). Der Schlag zeigt sich von oben als
// Verkürzung der Spannweite, nicht als Auf und Ab.
const zeichneStorch = (ctx, x, y, s, richtung, schlag, deckkraft) => {
  const spann = s * 0.80 * (0.58 + 0.42 * (1 - schlag));
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(richtung);
  ctx.globalAlpha = deckkraft;

  // Flügel als nach hinten gebogene Sicheln, an der Wurzel breit.
  for (const seite of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.04, 0);
    ctx.quadraticCurveTo(-s * 0.10, seite * spann * 0.55, -s * 0.26, seite * spann);
    ctx.quadraticCurveTo(s * 0.01, seite * spann * 0.46, s * 0.10, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Rumpf mit Hals und Schnabel voraus, Beine nach hinten hinaus.
  ctx.beginPath();
  ctx.moveTo(s * 0.54, 0);
  ctx.quadraticCurveTo(s * 0.12, -s * 0.058, -s * 0.30, -s * 0.048);
  ctx.lineTo(-s * 0.60, 0);
  ctx.quadraticCurveTo(-s * 0.30, s * 0.048, s * 0.12, s * 0.058);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

/**
 * Baut die Vogel-Schicht in das übergebene Element und liefert Griffe zum Ein-
 * und Ausblenden. Erzeugt wird erst beim ersten Einblenden — wer die
 * Draufsicht nie öffnet, soll den Aufwand nicht bezahlen.
 */
export const createSky = (host) => {
  let el = null;
  let canvas = null;
  let ctx = null;
  let voegel = [];
  let laeuft = false;
  let raf = 0;
  let zuletzt = 0;
  // Grundrichtung des Zuges; die einzelnen Vögel weichen nur leicht davon ab.
  const kurs = -0.5 + Math.random();
  // Höchstens so viele gleichzeitig im Bild. Ein Himmel voller Vögel wirkt
  // wie ein Bildschirmschoner — einzeln vorbeiziehende Störche wirken echt.
  const MAX_GLEICHZEITIG = 4;
  let bisNaechsterZug = 1.5;

  const masse = () => ({
    w: canvas.clientWidth || host.clientWidth || window.innerWidth,
    h: canvas.clientHeight || host.clientHeight || window.innerHeight,
  });

  // Setzt einen Storch knapp außerhalb des Bildes an, auf der Seite, aus der
  // seine Flugrichtung kommt.
  const neuerVogel = () => {
    const { w, h } = masse();
    const richtung = kurs + (Math.random() - 0.5) * 1.5;
    const rein = 60;
    return {
      x: Math.cos(richtung) > 0 ? -rein : w + rein,
      y: Math.random() * h,
      richtung,
      // Die Größe steht für die Flughöhe: kleinere Vögel wirken höher, ziehen
      // langsamer und blasser durchs Bild.
      groesse: 12 + Math.random() * 8,
      // Ruhiges Gleiten. Störche segeln, sie hetzen nicht.
      tempo: 11 + Math.random() * 13,
      phase: Math.random() * Math.PI * 2,
      takt: 0.7 + Math.random() * 0.7,
      gleitet: Math.random() < 0.6,
      gleitBis: Math.random() * 4,
    };
  };

  const resize = () => {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const male = (dt) => {
    const { w, h } = masse();
    ctx.clearRect(0, 0, w, h);

    // Nachschub: alle paar Sekunden ein bis zwei, solange Platz ist.
    if (dt) {
      bisNaechsterZug -= dt;
      if (bisNaechsterZug <= 0 && voegel.length < MAX_GLEICHZEITIG) {
        const wieViele = Math.min(1 + (Math.random() < 0.4 ? 1 : 0),
                                  MAX_GLEICHZEITIG - voegel.length);
        for (let i = 0; i < wieViele; i++) voegel.push(neuerVogel());
        bisNaechsterZug = 4 + Math.random() * 6;
      }
    }

    // Warmes Dunkelbraun statt Schwarz — reine schwarze Punkte über der hellen
    // Karte sehen aus wie Dreck auf dem Bildschirm.
    ctx.fillStyle = 'rgba(38, 31, 22, 0.75)';
    for (const v of voegel) {
      if (dt) {
        v.x += Math.cos(v.richtung) * v.tempo * dt;
        v.y += Math.sin(v.richtung) * v.tempo * dt;
        v.phase += dt * v.takt * Math.PI * 2;
        // Ab und zu gleiten statt schlagen — das nimmt der Bewegung das
        // Mechanische.
        v.gleitBis -= dt;
        if (v.gleitBis <= 0) {
          v.gleitet = Math.random() < 0.4;
          v.gleitBis = 1.5 + Math.random() * 3;
        }
      }
      const schlag = v.gleitet ? 0.18 : Math.sin(v.phase) * 0.5 + 0.5;
      zeichneStorch(ctx, v.x, v.y, v.groesse, v.richtung, schlag,
        0.42 + ((v.groesse - 12) / 8) * 0.38);
    }

    // Wer draußen ist, bleibt draußen — der nächste kommt mit dem nächsten Zug.
    if (dt) {
      const rand = 90;
      voegel = voegel.filter((v) => v.x > -rand && v.x < w + rand
                                 && v.y > -rand && v.y < h + rand);
    }
  };

  const tick = (jetzt) => {
    if (!laeuft) return;
    const dt = Math.min(0.05, (jetzt - (zuletzt || jetzt)) / 1000);
    zuletzt = jetzt;
    male(dt);
    raf = requestAnimationFrame(tick);
  };

  const build = () => {
    if (el) return;
    el = document.createElement('div');
    el.className = 'paas-sky';
    el.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.className = 'sky-canvas';
    el.appendChild(canvas);
    host.appendChild(el);
    ctx = canvas.getContext('2d');
    resize();
    // Mit zweien anfangen, damit beim Öffnen nicht erst nichts zu sehen ist;
    // die beiden starten mitten im Bild statt am Rand.
    voegel = Array.from({ length: 2 }, () => {
      const v = neuerVogel();
      v.x = masse().w * (0.25 + Math.random() * 0.5);
      return v;
    });
    bisNaechsterZug = 3 + Math.random() * 4;
    window.addEventListener('resize', resize);
  };

  return {
    show() {
      build();
      requestAnimationFrame(() => el && el.classList.add('is-on'));
      // Falls requestAnimationFrame nicht läuft (Hintergrund-Tab), zieht das
      // hier nach — sonst bliebe die Schicht dauerhaft unsichtbar.
      setTimeout(() => el && el.classList.add('is-on'), 80);
      if (laeuft) return;
      laeuft = true;
      zuletzt = 0;
      // Sofort ein Bild zeichnen, nicht erst beim ersten Ticker-Frame: sonst
      // bleibt die Schicht leer, bis requestAnimationFrame das erste Mal
      // feuert — und in einem Hintergrund-Tab feuert es gar nicht.
      male(0);
      // Bei reduzierter Bewegung bleibt es bei diesem stehenden Bild.
      if (REDUZIERT) return;
      raf = requestAnimationFrame(tick);
    },
    hide() {
      el && el.classList.remove('is-on');
      laeuft = false;
      cancelAnimationFrame(raf);
    },
    get element() { return el; },
  };
};
