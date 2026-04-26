/* PaasCursor — magnetic, contextual, crosshair
   Usage: const c = new PaasCursor({ magneticTargets: () => document.querySelectorAll('[data-marker]') });
          c.mount();
*/
class PaasCursor {
  constructor({ magneticTargets = () => [], magneticRadius = 120, root = document.body } = {}) {
    this.magneticTargets = magneticTargets;
    this.R = magneticRadius;
    this.root = root;
    this.mouse = { x: window.innerWidth/2, y: window.innerHeight/2 };
    this.pos = { x: this.mouse.x, y: this.mouse.y };
    this.vel = { x: 0, y: 0 };
    this.lastPos = { ...this.pos };
    this.state = 'default'; // default | hot | text
    this.pressing = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
  }
  mount() {
    if (this.coarse) return; // hide on touch
    const el = document.createElement('div');
    el.className = 'paas-cursor';
    el.innerHTML = `
      <div class="pc-cross"><span class="pc-h"></span><span class="pc-v"></span></div>
      <div class="pc-ring"><span class="pc-label t-caption">+ ÖFFNEN</span></div>
    `;
    document.body.appendChild(el);
    this.el = el;
    document.documentElement.classList.add('no-cursor');
    document.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    document.addEventListener('mousedown', () => { this.pressing = true; el.classList.add('pc-press'); });
    document.addEventListener('mouseup',   () => { this.pressing = false; el.classList.remove('pc-press'); });
    this._raf = requestAnimationFrame(() => this._tick());
  }
  unmount() {
    cancelAnimationFrame(this._raf);
    this.el?.remove();
    document.documentElement.classList.remove('no-cursor');
  }
  _tick() {
    // Find nearest magnetic target
    let nearest = null, nearestDist = Infinity, nearestCenter = null;
    for (const t of this.magneticTargets()) {
      const r = t.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const d = Math.hypot(this.mouse.x - cx, this.mouse.y - cy);
      if (d < nearestDist) { nearestDist = d; nearest = t; nearestCenter = { x: cx, y: cy }; }
    }
    let tx = this.mouse.x, ty = this.mouse.y;
    let hot = false;
    if (nearest && nearestDist < this.R) {
      const pull = 1 - nearestDist / this.R;
      // smooth-step the pull so it ramps in nicely
      const ease = pull * pull * (3 - 2 * pull);
      tx = this.mouse.x + (nearestCenter.x - this.mouse.x) * ease * 0.85;
      ty = this.mouse.y + (nearestCenter.y - this.mouse.y) * ease * 0.85;
      hot = true;
    }
    // Lerp
    const k = this.reduced ? 1 : 0.22;
    this.pos.x += (tx - this.pos.x) * k;
    this.pos.y += (ty - this.pos.y) * k;
    this.vel.x = this.pos.x - this.lastPos.x;
    this.vel.y = this.pos.y - this.lastPos.y;
    this.lastPos = { ...this.pos };
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const stretchScale = Math.min(1.12, 1 + speed * 0.004);
    const stretchAngle = Math.atan2(this.vel.y, this.vel.x) * 180 / Math.PI;
    this.el.style.setProperty('--x', this.pos.x + 'px');
    this.el.style.setProperty('--y', this.pos.y + 'px');
    this.el.style.setProperty('--rot', stretchAngle + 'deg');
    this.el.style.setProperty('--stretch', this.reduced ? 1 : stretchScale);
    // State
    const newState = hot ? 'hot' : 'default';
    if (newState !== this.state) {
      this.el.classList.remove('pc-' + this.state);
      this.el.classList.add('pc-' + newState);
      this.state = newState;
    }
    this._raf = requestAnimationFrame(() => this._tick());
  }
}
window.PaasCursor = PaasCursor;
