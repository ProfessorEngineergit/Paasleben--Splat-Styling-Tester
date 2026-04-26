/* PaasLoader — typewriter loading experience
   Drop in: const loader = new PaasLoader({ text, manager, onDone });
*/
class PaasLoader {
  constructor({ text = "Ein Ort zum Atmen. Ein Ort für Skulpturen.", manager = null, root = document.body, onDone } = {}) {
    this.text = text;
    this.manager = manager;
    this.root = root;
    this.onDone = onDone;
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
      <button class="pl-skip t-caption" type="button">[ESC] ÜBERSPRINGEN</button>
    `;
    this.root.appendChild(el);
    this.el = el;
    this.$text = el.querySelector('.pl-text');
    this.$caret = el.querySelector('.pl-caret');
    this.$pct = el.querySelector('.pl-pct');
    this.$asset = el.querySelector('.pl-asset');
    this.$fill = el.querySelector('.pl-line-fill');
    this.$skip = el.querySelector('.pl-skip');
    this.$skip.addEventListener('click', () => this._finish(true));
    this._keyHandler = (e) => { if (e.key === 'Escape') this._finish(true); };
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
  _maybeFinish() {
    if (this._typingDone && this.progress >= 1 && !this._finishing) {
      this._finish(false);
    }
  }
  async _finish(skipped) {
    if (this._finishing) return;
    this._finishing = true;
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
window.PaasLoader = PaasLoader;
