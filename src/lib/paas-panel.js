/* PaasPanel — slide-up + scroll-reveal detail panel
   Usage: const panel = new PaasPanel(); panel.open(schildData);
*/
import { t } from './i18n.js';

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
      <button class="pp-close t-caption" type="button">${t('× SCHLIESSEN')}</button>
      <div class="pp-scroll">
        <div class="pp-spacer"></div>
        <header class="pp-head">
          <div class="pp-cap t-caption"></div>
          <h1 class="pp-title t-headline"></h1>
          <div class="pp-plus">+</div>
          <ul class="pp-meta"></ul>
        </header>
        <article class="pp-article paper">
          <figure class="pp-figure"></figure>
          <div class="pp-text">
            <div class="pp-body t-body"></div>
            <section class="pp-extra t-body"></section>
          </div>
          <footer class="pp-foot">
            <div class="hairline"></div>
            <div class="t-caption pp-back">${t('← ZURÜCK ZUR KARTE')}</div>
            <nav class="t-caption pp-legal" aria-label="${t('Kontakt und Rechtliches')}">
              <a href="mailto:kontakt@paasleben.com" data-contact-email>${t('Kontakt')}</a>
              <a href="#impressum">${t('Impressum')}</a>
              <a href="#datenschutz">${t('Datenschutz')}</a>
            </nav>
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
    this.$extra = el.querySelector('.pp-extra');
    this.$close.addEventListener('click', () => this.close());
    el.querySelector('.pp-back').addEventListener('click', () => this.close());
    this.$scroll.addEventListener('scroll', () => this._onScroll(), { passive: true });
    // Auch während des kurzen Kameraflugs vor dem sichtbaren Panel reagieren.
    // Der vom Hauptmodul dekorierte close()-Pfad bricht dort den wartenden
    // Einflug ab und kann z. B. in die Birdseye-Ansicht zurückkehren.
    this._keyHandler = (e) => { if (e.key === 'Escape') this.close(); };
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
    this._video = data.video || '';
    this._videoPlaceholder = !this._video && !!data.videoPlaceholder;
    this._captions = !!data.captions;
    // Orte mit Video (oder Video-Platzhalter) werden als Banner gesetzt:
    // Film über die volle Breite, Text und Gastgeber darunter.
    this.el.classList.toggle('pp-has-hero', Boolean(this._video || this._videoPlaceholder));
    // Zusatzabschnitt (z. B. Gastgeber) — eigenes Element, damit das
    // Bearbeiten des Fließtexts ihn nicht erfasst.
    this.$extra.innerHTML = data.extraHtml || '';
    this.$extra.hidden = !data.extraHtml;
    this.updateImages(images, data.title);
    // Absätze, die selbst mit einem Block-Element beginnen (Überschrift,
    // Gastgeber-Profil …), nicht in <p> packen — sonst zerlegt der Browser
    // das Markup und es entstehen leere Absätze.
    const BLOCK = /^<(h[1-6]|div|section|figure|ul|ol|blockquote|hr|table)[\s>]/i;
    this.$body.innerHTML = (data.body || '').split('\n\n')
      .map(p => p.trim()).filter(Boolean)
      .map(p => (BLOCK.test(p) ? p : `<p>${p}</p>`)).join('');
  }
  updateImages(images, title = '') {
    const _esc = (s) => String(s || '').replace(/"/g, '&quot;');
    // Ein Ort mit Video zeigt statt der Fotos das Video — gedämpft, stumm,
    // in Schleife, wie ein bewegtes Titelbild.
    const poster = Array.isArray(images) ? images.find(Boolean)?.src || '' : '';
    if (this._video) {
      if (this.$figure.dataset.video === this._video) {
        // Fotos kommen oft erst nach dem Video an: erstes Foto als Standbild.
        const video = this.$figure.querySelector('video');
        if (video && poster && !video.getAttribute('poster')) video.setAttribute('poster', poster);
        return;
      }
      this.$figure.className = 'pp-figure pp-video';
      this.$figure.dataset.video = this._video;
      this.$figure.innerHTML = `<video src="${_esc(this._video)}"${poster ? ` poster="${_esc(poster)}"` : ''} autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>`;
      this.$figure.querySelector('video').play?.().catch(() => {});
      return;
    }
    delete this.$figure.dataset.video;
    // Video angekündigt, aber noch nicht hinterlegt: derselbe Rahmen wie das
    // spätere Video, mit dem ersten Foto als Standbild und einem Hinweis.
    // Sobald im Editor eine Videodatei eingetragen ist, läuft dort der Film.
    if (this._videoPlaceholder) {
      this.$figure.className = 'pp-figure pp-video pp-video-pending';
      this.$figure.innerHTML = `
        ${poster ? `<img class="pp-video-poster" src="${_esc(poster)}" alt="" decoding="async">` : ''}
        <div class="pp-video-note">
          <span class="pp-video-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
          </span>
          <span class="t-caption">${t('Film folgt in Kürze')}</span>
        </div>`;
      return;
    }
    const _escText = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const imageList = Array.isArray(images) ? images.filter(Boolean) : [];
    if (imageList.length) {
      const cls = `pp-gallery pp-gallery--${Math.min(imageList.length, 6)}${this._captions ? ' pp-gallery--captions' : ''}`;
      this.$figure.className = `pp-figure ${cls}`;
      this.$figure.innerHTML = imageList.map((img, i) => (
        `<div class="pp-gallery-item" style="--i:${i}">
           <img src="${_esc(img.src)}" alt="${_esc(img.alt)}" loading="lazy" decoding="async">
           ${this._captions && img.alt ? `<figcaption class="pp-caption">${_escText(img.alt)}</figcaption>` : ''}
         </div>`
      )).join('');
    } else {
      this.$figure.className = 'pp-figure';
      this.$figure.innerHTML = `<div class="pp-placeholder"><span class="t-caption">${t('BILD')} · ${title || ''}</span></div>`;
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
      }, 120);
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
      setTimeout(() => this.el.classList.remove('pp-opening'), 620);
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
    this._closeTimer = setTimeout(() => { this._closing = false; }, 560);
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
      // Der Papierverlauf folgt ab dem ersten bewussten Scrollimpuls, bleibt
      // im oberen Bildschirmteil aber transparent. Das verhindert den alten
      // harten Weißsprung, ohne Marker hinter dem Lesepapier freizulegen.
      const t = Math.min(1, Math.max(0, (y - h * 0.015) / (h * 0.34)));
      this.el.style.setProperty('--reveal', t);
      if (this.sceneVeil) this.sceneVeil.style.opacity = String(t);
      this.onScroll?.({ y, height: h, reveal: t });
    });
  }
}
