// ===================== ENTRADA: teclado, gamepad, toque =====================
const Input = {
  keys: {}, steerS: 0, pad: null, usingPad: false, touchOn: false,
  t: { steer: 0, gas: 0, brake: 0, hb: 0 }, edge: {}, prevBtn: [], lastDevice: 'kbd',
  init() {
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      this.keys[e.code] = 1; this.lastDevice = 'kbd';
      if (e.code === 'KeyE' || e.code === 'PageUp') this.edge.shUp = 1; if (e.code === 'KeyQ' || e.code === 'PageDown') this.edge.shDn = 1; if (e.code === 'KeyG') this.edge.trans = 1; // câmbio: E sobe, Q desce, G troca auto/manual
      if (e.code === 'KeyC') this.edge.cam = 1; if (e.code === 'KeyR') this.edge.reset = 1; if (e.code === 'KeyT') this.edge.respawn = 1;
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Enter') this.edge.pause = 1; if (e.code === 'KeyM') this.edge.mute = 1; if (e.code === 'KeyH') this.edge.hud = 1;
      if (this.isGameKey(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = 0; });
    addEventListener('blur', () => { this.keys = {}; this.t.gas = this.t.brake = this.t.hb = 0; });
  },
  isGameKey(c) { return c === 'Space' || c.startsWith('Arrow') || c === 'Tab'; },
  padBtn(g, i) { const b = g.buttons[i]; return b ? (b.value !== undefined ? b.value : (b.pressed ? 1 : 0)) : 0; },
  poll(dt) {
    const k = this.keys; let thr = 0, brk = 0, hb = 0, st = 0;
    const kUp = k.ArrowUp || k.KeyW, kDn = k.ArrowDown || k.KeyS, kL = k.ArrowLeft || k.KeyA, kR = k.ArrowRight || k.KeyD;
    if (kUp || kDn || kL || kR || k.Space) this.lastDevice = 'kbd';
    thr = kUp ? 1 : 0; brk = kDn ? 1 : 0; hb = k.Space ? 1 : 0;
    const tgt = (kR ? 1 : 0) - (kL ? 1 : 0);
    const rate = tgt === 0 ? 7 : (Math.sign(tgt) !== Math.sign(this.steerS) && this.steerS !== 0 ? 11 : 4.2);
    const d = tgt - this.steerS; this.steerS += Math.max(-rate * dt, Math.min(rate * dt, d));
    st = this.steerS; let orbit = 0;
    // gamepad
    let pads = []; try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; } let g = null;
    for (const p of pads) if (p && p.connected) { g = p; break; }
    this.pad = g;
    if (g) {
      let ax = g.axes[0] || 0; const dz = 0.09; ax = Math.abs(ax) < dz ? 0 : Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz); ax = Math.sign(ax) * Math.pow(Math.abs(ax), 1.35);
      let rt = this.padBtn(g, 7), lt = this.padBtn(g, 6); if (g.buttons.length <= 7) { rt = 0; lt = 0; }
      const a = this.padBtn(g, 0), x = this.padBtn(g, 2), b = this.padBtn(g, 1), y = this.padBtn(g, 3), start = this.padBtn(g, 9), back = this.padBtn(g, 8);
      const up = this.padBtn(g, 12), down = this.padBtn(g, 13);
      const any = Math.abs(ax) > 0.15 || rt > 0.1 || lt > 0.1 || a || x;
      if (any) this.lastDevice = 'pad';
      if (this.lastDevice === 'pad') { thr = Math.max(thr, rt, up); brk = Math.max(brk, lt, down); hb = Math.max(hb, a > 0.5 || x > 0.5 ? 1 : 0); if (Math.abs(ax) > 0.001 || !(kL || kR)) st = ax; }
      const pb = this.prevBtn; const rise = (i, v) => (v > 0.5 && !(pb[i] > 0.5));
      if (rise(3, y)) this.edge.cam = 1; if (rise(1, b)) this.edge.reset = 1; if (rise(9, start)) this.edge.pause = 1; if (rise(8, back)) this.edge.respawn = 1; if (rise(0, a)) this.edge.padA = 1;
      const lb = this.padBtn(g, 4), rb = this.padBtn(g, 5); if (rise(5, rb)) this.edge.shUp = 1; if (rise(4, lb)) this.edge.shDn = 1; pb[5] = rb; pb[4] = lb; // RB sobe, LB desce (câmbio manual)
      pb[3] = y; pb[1] = b; pb[9] = start; pb[8] = back; pb[0] = a;
      orbit = Math.abs(g.axes[2] || 0) > 0.2 ? g.axes[2] : 0;
      this.hasPad = true;
    } else this.hasPad = false;
    // toque
    if (this.touchOn) {
      const T = this.t; if (T.gas || T.brake || Math.abs(T.steer) > 0.02) this.lastDevice = 'touch';
      if (this.lastDevice === 'touch') { thr = Math.max(thr, T.gas); brk = Math.max(brk, T.brake); hb = Math.max(hb, T.hb); if (Math.abs(T.steer) > 0.02) st = T.steer; else if (!kL && !kR && !g) st = 0; }
    }
    return { throttle: thr, brake: brk, hb, steer: Math.max(-1, Math.min(1, st)), orbit };
  },
  take(n) { const v = this.edge[n]; this.edge[n] = 0; return !!v; },
  rumble(power, ms) {
    try { const g = this.pad; if (g && g.vibrationActuator && g.vibrationActuator.playEffect) g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, power), weakMagnitude: Math.min(1, power * 0.7) }); } catch (e) {}
    try { if (this.lastDevice === 'touch' && navigator.vibrate) navigator.vibrate(Math.min(200, ms)); } catch (e) {}
  },
  bindTouch() {
    this.touchOn = true; const T = this.t;
    const hold = (id, key) => { const el = document.getElementById(id); if (!el) return; const on = (e) => { e.preventDefault(); T[key] = 1; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) {} }; const off = (e) => { T[key] = 0; el.classList.remove('on'); }; el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off); el.addEventListener('contextmenu', (e) => e.preventDefault()); };
    hold('t-gas', 'gas'); hold('t-brake', 'brake'); hold('t-hb', 'hb');
    const sl = document.getElementById('t-steer'), th = document.getElementById('t-thumb'); let pid = null;
    const setS = (e) => { const r = sl.getBoundingClientRect(); const v = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2 / 0.86)); T.steer = Math.abs(v) < 0.06 ? 0 : v; th.style.transform = 'translateX(' + (v * (r.width * 0.43)) + 'px)'; };
    sl.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { sl.setPointerCapture(pid); } catch (_) {} setS(e); sl.classList.add('on'); });
    sl.addEventListener('pointermove', (e) => { if (e.pointerId === pid) setS(e); });
    const rel = (e) => { if (e.pointerId !== pid) return; pid = null; T.steer = 0; th.style.transform = 'translateX(0)'; sl.classList.remove('on'); };
    sl.addEventListener('pointerup', rel); sl.addEventListener('pointercancel', rel);
    const tap = (id, name) => { const el = document.getElementById(id); if (el) el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.edge[name] = 1; this.lastDevice = 'touch'; }); };
    tap('b-cam', 'cam'); tap('b-reset', 'reset');
  },
};
