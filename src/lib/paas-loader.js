/* PaasLoader — typewriter loading experience
   Drop in: const loader = new PaasLoader({ text, manager, onDone });
*/
export class PaasLoader {
  constructor({ text = "Ein Ort zum Atmen. Ein Ort für Skulpturen.", manager = null, root = document.body, onDone, onReveal,
    // Nach dieser Zeit wird nur die Schreibanimation abgekürzt. Ausgeblendet
    // wird erst, sobald die Szene wirklich bereit ist.
    autoAfterMs = 4200,
    // Notausgang, falls das Laden gar nicht fertig wird.
    hardCapMs = 22000 } = {}) {
    this.text = text;
    this.manager = manager;
    this.root = root;
    this.onDone = onDone;
    this.onReveal = onReveal;
    this.autoAfterMs = autoAfterMs;
    this.hardCapMs = hardCapMs;
    this.progress = 0;
    this.typed = "";
    this.skipped = false;
    this._build();
    if (manager) {
      manager.onProgress = (url, loaded, total) => {
        this.setProgress(loaded / total, url.split('/').pop());
      };
      manager.onLoad = () => this.setProgress(1, "");
    }
  }
  _build() {
    const el = document.createElement('div');
    el.className = 'paas-loader paper';
    el.innerHTML = `
      <div class="pl-stage">
        <div class="pl-caption t-caption">PAASLEBEN · KAPITEL EINS</div>
        <div class="pl-typed t-headline"><span class="pl-text"></span><span class="pl-caret">|</span></div>
      </div>
      <div class="pl-progress">
        <div class="pl-meta t-caption"><span class="pl-pct">000</span> · <span class="pl-asset">vorbereiten</span></div>
        <div class="pl-line"><div class="pl-line-fill"></div></div>
      </div>
      <button class="pl-skip t-caption" type="button"></button>
    `;
    this.root.appendChild(el);
    this.el = el;
    this.$text = el.querySelector('.pl-text');
    this.$caret = el.querySelector('.pl-caret');
    this.$pct = el.querySelector('.pl-pct');
    this.$asset = el.querySelector('.pl-asset');
    this.$fill = el.querySelector('.pl-line-fill');
    this.$skip = el.querySelector('.pl-skip');
    // Auf Touch-Geräten gibt es keine Esc-Taste — dort auf das Tippen hinweisen.
    const touch = matchMedia('(pointer: coarse)').matches;
    this.$skip.textContent = touch ? 'TIPPEN ZUM ÜBERSPRINGEN' : '[ESC] ÜBERSPRINGEN';
    // Die ganze Fläche ist auslösbar, nicht nur der kleine Knopf. Übersprungen
    // wird die Schreibanimation, nicht das Laden der Szene — sonst stünde nach
    // einem frühen Tippen nur eine leere Fläche im Bild.
    el.addEventListener('pointerdown', () => this._skipTyping());
    this._keyHandler = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') this._skipTyping();
    };
    window.addEventListener('keydown', this._keyHandler);
  }
  setProgress(p, asset = "") {
    this.progress = Math.max(this.progress, Math.min(1, p));
    this.$fill.style.transform = `scaleX(${this.progress})`;
    this.$pct.textContent = String(Math.round(this.progress * 100)).padStart(3, '0');
    if (asset) this.$asset.textContent = asset;
    this._maybeFinish();
  }
  async start() {
    // Nach autoAfterMs wird der Text abgekürzt — geschlossen wird der Loader
    // aber erst, wenn die Szene wirklich geladen ist.
    //
    // Vorher schloss er hier hart. Dauerte der Splat länger als die 4,2 s,
    // stand danach eine leere Fläche im Bild, bis das Laden fertig war und der
    // Einflug begann. Genau das war der Fehler: der Ladebildschirm ging, aber
    // es gab noch nichts zu sehen.
    this._autoTimer = setTimeout(() => this._skipTyping(), this.autoAfterMs);

    // Absolute Obergrenze. Wenn das Laden hängt, soll die Seite trotzdem
    // irgendwann durchlassen, statt ewig auf dem Ladebildschirm zu stehen.
    this._hardTimer = setTimeout(() => this._finish(true), this.hardCapMs);
    // Type the text with jitter
    for (let i = 0; i < this.text.length; i++) {
      if (this.skipped) break;
      this.typed += this.text[i];
      this.$text.textContent = this.typed;
      const ch = this.text[i];
      let delay = 60 + Math.random() * 60;
      if (ch === ' ') delay = 30;
      if ('.,—!?'.includes(ch)) delay = 280;
      await new Promise(r => setTimeout(r, delay));
    }
    this._typingDone = true;
    this._maybeFinish();
    return new Promise(res => { this._resolve = res; });
  }
  _skipTyping() {
    if (this._finishing || this._typingDone) return;
    this.typed = this.text;
    this.$text.textContent = this.text;
    this._typingDone = true;
    this.skipped = true;   // bricht die Tippschleife ab
    this.$skip.textContent = 'SZENE WIRD GELADEN';
    this.$skip.disabled = true;
    this._maybeFinish();
  }
  _maybeFinish() {
    if (this._typingDone && this.progress >= 1 && !this._finishing) {
      this._finish(this.skipped);
    }
  }
  async _finish(skipped) {
    if (this._finishing) return;
    this._finishing = true;
    clearTimeout(this._autoTimer);
    clearTimeout(this._hardTimer);
    this.skipped = skipped;
    if (skipped) { this.$text.textContent = this.text; this._typingDone = true; }
    // hold beat
    await new Promise(r => setTimeout(r, skipped ? 100 : 600));
    this.$caret.style.opacity = '0';
    // collapse line to a point
    this.$fill.style.transition = 'transform .9s cubic-bezier(.65,0,.35,1), opacity .4s';
    this.el.querySelector('.pl-line').style.transition = 'transform .9s cubic-bezier(.65,0,.35,1)';
    this.el.querySelector('.pl-line').style.transformOrigin = 'center';
    this.el.querySelector('.pl-line').style.transform = 'scaleX(0)';
    await new Promise(r => setTimeout(r, 700));
    // Die Kamera beginnt bereits hinter dem ausblendenden Papier zu fliegen.
    // Dadurch wird der Loader zum Vorhang der Szene statt zu einer Pause vor
    // einer Animation, die erst nach seinem Entfernen startet.
    try { this.onReveal?.(); } catch (error) {
      console.warn('Einflug konnte nicht vorbereitet werden:', error);
    }
    // crossfade paper out
    this.el.style.transition = 'opacity 1.2s cubic-bezier(.22,1,.36,1)';
    this.el.style.opacity = '0';
    await new Promise(r => setTimeout(r, 1200));
    this.el.remove();
    window.removeEventListener('keydown', this._keyHandler);
    this.onDone && this.onDone();
    this._resolve && this._resolve();
  }
}
