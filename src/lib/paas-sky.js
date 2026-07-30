// Wolken- und Nebelschichten für die Draufsicht.
//
// Bewusst als Overlay über dem Canvas und nicht als Geometrie in der
// Splat-Szene: Die Szene wird von der Gaussian-Splat-Bibliothek gerendert, ihr
// Material schreibt keine Tiefe, und eigene Meshes dort einzuhängen hat sich
// als der Weg erwiesen, auf dem die Darstellung kippt. Ein Overlay kann das
// nicht — und weil die Kamera in der Draufsicht praktisch stillsteht, fehlt
// auch keine Parallaxe.
//
// Die Textur entsteht einmalig aus fraktalem Rauschen (mehrere Oktaven
// Wertrauschen). Das ergibt weiche, ungleichmäßige Ballungen, wie sie eine
// Wolkendecke von oben hat — im Gegensatz zu CSS-Verläufen, die immer nach
// Blase aussehen.

const hash = (x, y, seed) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};

// Wertrauschen mit weicher Interpolation (smoothstep), gitterbasiert.
const valueNoise = (x, y, seed) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
};

/**
 * Zeichnet eine kachelbare Wolkentextur.
 * @param {number} size   Kantenlänge in Pixel (Zweierpotenz, damit sie kachelt)
 * @param {number} octaves  Zahl der Rauschoktaven — mehr = feinere Fransen
 * @param {number} deckung  0…1, wieviel Fläche Wolke wird
 * @param {number} seed
 */
const cloudCanvas = (size, octaves, deckung, seed) => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const px = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let wert = 0, amplitude = 0.5, frequenz = 4, summe = 0;
      for (let o = 0; o < octaves; o++) {
        // Koordinaten modulo Frequenz, damit die Kachel an den Rändern passt.
        const nx = (x / size) * frequenz;
        const ny = (y / size) * frequenz;
        wert += valueNoise(nx, ny, seed + o * 13) * amplitude;
        summe += amplitude;
        amplitude *= 0.5;
        frequenz *= 2;
      }
      wert /= summe;
      // Schwelle: unterhalb bleibt es klarer Himmel, darüber verdichtet es sich.
      const a = Math.max(0, wert - (1 - deckung)) / Math.max(0.001, deckung);
      const i = (y * size + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(Math.min(1, a * a * (3 - 2 * a)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
};

/**
 * Baut die Schichten in das übergebene Element und liefert Griffe zum Ein- und
 * Ausblenden. Erzeugt wird erst beim ersten Einblenden — die Textur kostet
 * einen Moment Rechenzeit, und wer die Draufsicht nie öffnet, soll ihn nicht
 * bezahlen.
 */
export const createSky = (host) => {
  let el = null;

  const build = () => {
    if (el) return;
    el = document.createElement('div');
    el.className = 'paas-sky';
    el.setAttribute('aria-hidden', 'true');
    // Zwei Wolkenschichten mit unterschiedlicher Körnung und Geschwindigkeit
    // ergeben Tiefe; darunter eine weiche Nebelbank, die langsamer zieht.
    const wolkenGrob = cloudCanvas(256, 5, 0.62, 7.3);
    const wolkenFein = cloudCanvas(256, 6, 0.45, 21.9);
    el.innerHTML = `
      <div class="sky-fog"></div>
      <div class="sky-clouds sky-clouds-far"  style="background-image:url(${wolkenGrob})"></div>
      <div class="sky-clouds sky-clouds-near" style="background-image:url(${wolkenFein})"></div>`;
    host.appendChild(el);
  };

  return {
    show() {
      build();
      // Ein Frame Versatz, damit der Übergang greift und nicht durchspringt.
      requestAnimationFrame(() => el && el.classList.add('is-on'));
      // Falls requestAnimationFrame nicht läuft (Hintergrund-Tab), zieht das
      // hier nach — sonst bliebe die Schicht dauerhaft unsichtbar.
      setTimeout(() => el && el.classList.add('is-on'), 80);
    },
    hide() {
      el && el.classList.remove('is-on');
    },
    get element() { return el; },
  };
};
