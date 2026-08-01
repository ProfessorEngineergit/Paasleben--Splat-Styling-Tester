/* PaasPanel — slide-up + scroll-reveal detail panel
   Usage: const panel = new PaasPanel(); panel.open(schildData);
*/
export class PaasPanel {
  constructor({ root = document.body, sceneVeil = null } = {}) {
    this.root = root;
    this.sceneVeil = sceneVeil; // optional element overlaying the three.js canvas
    this._switchToken = 0;
    this._build();
  }
  _build() {
    const el = document.createElement('div');
    el.className = 'paas-panel';
    el.innerHTML = `
      <div class="pp-glass"></div>
      <button class="pp-close t-caption" type="button">× SCHLIESSEN</button>
      <div class="pp-scroll">
        <div class="pp-spacer"></div>
        <header class="pp-head">
          <div class="pp-cap t-caption"></div>
          <h1 class="pp-title t-headline"></h1>
          <div class="pp-plus">+</div>
          <ul class="pp-meta"></ul>
          <div class="pp-cue t-caption">↓ MEHR LESEN</div>
        </header>
        <article class="pp-article paper">
          <figure class="pp-figure"></figure>
          <div class="pp-body t-body"></div>
          <footer class="pp-foot">
            <div class="hairline"></div>
            <div class="t-caption pp-back">← ZURÜCK ZUR KARTE</div>
          </footer>
        </article>
      </div>
    `;
    this.root.appendChild(el);
    this.el = el;
    this.$scroll = el.querySelector('.pp-scroll');
    this.$close = el.querySelector('.pp-close');
    this.$cap = el.querySelector('.pp-cap');
    this.$title = el.querySelector('.pp-title');
    this.$meta = el.querySelector('.pp-meta');
    this.$figure = el.querySelector('.pp-figure');
    this.$body = el.querySelector('.pp-body');
    this.$close.addEventListener('click', () => this.close());
    el.querySelector('.pp-back').addEventListener('click', () => this.close());
    this.$scroll.addEventListener('scroll', () => this._onScroll(), { passive: true });
    this._keyHandler = (e) => { if (e.key === 'Escape' && this.open_) this.close(); };
    window.addEventListener('keydown', this._keyHandler);
  }
  _populate(data) {
    this.$cap.textContent = data.caption || '';
    this.$title.textContent = data.title || '';
    this.$meta.innerHTML = (data.meta || []).map(m =>
      `<li class="t-caption"><span>${m.label}</span> · <span>${m.value}</span></li>`).join('');
    const images = Array.isArray(data.images) && data.images.length
      ? data.images
      : (data.image ? [{ src: data.image, alt: data.imageAlt }] : []);
    this.updateImages(images, data.title);
    this.$body.innerHTML = (data.body || '').split('\n\n').map(p => `<p>${p}</p>`).join('');
  }
  updateImages(images, title = '') {
    const _esc = (s) => String(s || '').replace(/"/g, '&quot;');
    const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
    if (imageList.length) {
      const cls = `pp-gallery pp-gallery--${Math.min(imageList.length, 6)}`;
      this.$figure.className = `pp-figure ${cls}`;
      this.$figure.innerHTML = imageList.map((img, i) => (
        `<div class="pp-gallery-item" style="--i:${i}">
           <img src="${_esc(img.src)}" alt="${_esc(img.alt)}" loading="lazy" decoding="async">
         </div>`
      )).join('');
    } else {
      this.$figure.className = 'pp-figure';
      this.$figure.innerHTML = `<div class="pp-placeholder"><span class="t-caption">BILD · ${title || ''}</span></div>`;
    }
  }

  open(data, { direction = 1 } = {}) {
    if (this.open_) {
      const token = ++this._switchToken;
      this.el.dataset.switchDirection = direction < 0 ? 'back' : 'forward';
      this.el.classList.remove('pp-switching-in');
      this.el.classList.add('pp-switching-out');
      clearTimeout(this._switchTimer);
      this._switchTimer = setTimeout(() => {
        if (token !== this._switchToken || !this.open_) return;
        this._populate(data);
        this.$scroll.scrollTop = 0;
        this.el.style.setProperty('--reveal', 0);
        if (this.sceneVeil) this.sceneVeil.style.opacity = '0';
        this.el.classList.remove('pp-switching-out');
        this.el.classList.add('pp-switching-in');
        requestAnimationFrame(() => this.el.classList.remove('pp-switching-in'));
        this._onScroll();
      }, 150);
      return;
    }
    this.open_ = true;
    this._closing = false;
    clearTimeout(this._closeTimer);
    this._populate(data);
    this.$scroll.scrollTop = 0;
    this.el.classList.add('pp-opening');
    requestAnimationFrame(() => {
      // Wurde zwischenzeitlich geschlossen (der Callback kann verzoegert
      // feuern, z. B. wenn der Tab im Hintergrund war), darf er das Panel
      // nicht wieder oeffnen — sonst steht pp-open bei open_ === false und
      // Escape/Schliessen greifen nicht mehr.
      if (!this.open_) return;
      this.el.classList.add('pp-open');
      setTimeout(() => this.el.classList.remove('pp-opening'), 800);
    });
    this._onScroll();
  }
  close() {
    if (!this.open_) return;
    this.open_ = false;
    // _closing sperrt _onScroll: der Smooth-Scroll dauerte laenger als die
    // 300 ms, der Scroll-Listener setzte --reveal und den Szenen-Schleier
    // danach wieder hoch — die Szene blieb milchig haengen.
    this._closing = true;
    this.el.classList.remove('pp-open');
    this.el.classList.remove('pp-opening');
    this.el.classList.remove('pp-switching-out', 'pp-switching-in');
    this._switchToken = (this._switchToken || 0) + 1;
    clearTimeout(this._switchTimer);
    this.el.style.setProperty('--reveal', 0);
    if (this.sceneVeil) this.sceneVeil.style.opacity = '0';
    // hart zuruecksetzen statt smooth — das Panel faehrt ohnehin herunter
    this.$scroll.scrollTop = 0;
    clearTimeout(this._closeTimer);
    this._closeTimer = setTimeout(() => { this._closing = false; }, 700);
  }
  _onScroll() {
    if (this._closing) return;
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = 0;
      if (this._closing) return;
      const y = this.$scroll.scrollTop;
      const h = this.$scroll.clientHeight;
      if (!h) return;
      // Der Inhalt erreicht die Bilder nun deutlich früher. Nur GPU-günstige
      // Opacity-Werte ändern; Blur und Masken bleiben währenddessen stabil.
      const t = Math.min(1, Math.max(0, (y - h * 0.12) / (h * 0.30)));
      this.el.style.setProperty('--reveal', t);
      if (this.sceneVeil) this.sceneVeil.style.opacity = String(t);
      this.onScroll?.({ y, height: h, reveal: t });
    });
  }
}
