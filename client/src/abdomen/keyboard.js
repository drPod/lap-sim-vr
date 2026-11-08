// Mouse + keyboard tool-pose source (desktop testing without the tracker).
// Produces the same fulcrum poses as the physical tracker.
import { TOOL_TYPES } from './tools.js';

const IDS = { Digit1: 'left', Digit2: 'right', Digit3: 'assist', Digit0: 'scope' };

export class KeyboardTools {
  constructor(abd, el, helpEl) {
    Object.assign(this, { abd, el, helpEl });
    this.active = 'right'; this.down = new Set(); this.drag = null; this.jawHeld = false;
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => { if (e.button === 2) this.jawHeld = true; else this.drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointerup', (e) => { if (e.button === 2) this.jawHeld = false; else this.drag = null; });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const p = this.pose(); p.yaw -= (e.clientX - this.drag.x) * 0.003; p.pitch -= (e.clientY - this.drag.y) * 0.003;
      this.drag = { x: e.clientX, y: e.clientY }; this.touch();
    });
    el.addEventListener('wheel', (e) => { const p = this.pose(); p.depth = Math.max(0.02, Math.min(0.2, p.depth - Math.sign(e.deltaY) * 0.002)); this.touch(); e.preventDefault(); }, { passive: false });
    this.help();
  }
  pose() { return this.abd.poses[this.active]; }
  touch() { this.abd.lastExternal = 0; this.used = true; }
  key(e, isDown) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (isDown) this.down.add(e.code); else this.down.delete(e.code);
    if (!isDown) return;
    if (IDS[e.code]) { this.active = IDS[e.code]; this.help(); }
    if (e.code === 'KeyT' && this.active !== 'scope') {
      const p = this.pose(); p.tool = TOOL_TYPES[(TOOL_TYPES.indexOf(p.tool) + 1) % TOOL_TYPES.length];
      this.abd.setPoses([{ id: this.active, tool: p.tool }], false); this.help();
    }
  }
  update(dt) {
    if (!this.used && !this.down.size && !this.jawHeld) return;
    const p = this.pose(), d = this.down, r = dt * 0.6;
    if (d.has('ArrowLeft')) p.yaw += r; if (d.has('ArrowRight')) p.yaw -= r;
    if (d.has('ArrowUp')) p.pitch += r; if (d.has('ArrowDown')) p.pitch -= r;
    if (d.has('KeyW')) p.depth = Math.min(0.2, p.depth + dt * 0.03); if (d.has('KeyS')) p.depth = Math.max(0.02, p.depth - dt * 0.03);
    if (d.has('KeyQ')) p.roll -= dt * 2; if (d.has('KeyE')) p.roll += dt * 2;
    if (this.active !== 'scope') {
      const target = (d.has('Space') || this.jawHeld) ? 0 : 1;
      p.jaw += Math.sign(target - p.jaw) * Math.min(Math.abs(target - p.jaw), dt * 6);
      p.energy = d.has('KeyF');
    }
    if (d.size || this.jawHeld) this.touch();
  }
  help() {
    if (!this.helpEl) return;
    const p = this.pose();
    this.helpEl.innerHTML = `<b>Active: ${this.active}</b> (${p.tool}, port ${p.port}) — keys 1 left · 2 right · 3 assistant · 0 scope<br>
      drag / arrows: pivot about the port · wheel or W/S: insert/withdraw · Q/E: roll<br>
      hold Space or right mouse: close jaws · F: energy (hook) · T: change instrument`;
  }
}
