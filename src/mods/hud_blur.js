// ===================== HUD ESTILO BLUR =====================
// Retrovisor no topo (segunda renderização para trás), minimapa redondo com a velocidade embaixo,
// painel de tempo / velocidade máxima / distância, barras de rotação e avisos de derrapagem e salto (sem pontos).
// Efeito de velocidade: linhas radiais nas bordas + vinheta, que crescem com a velocidade.
const HudBlur = (() => {
  const $ = (id) => document.getElementById(id);
  let built = false, el = {}, fx, fxc, T = { time: 0, top: 0, dist: 0, drift: 0, air: 0, maxAir: 0, lastTop: 0, callT: 0 };
  const fmt = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t * 100) % 100); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(c).padStart(2, '0'); };
  function build() {
    if (built) return; const hud = $('hud'); if (!hud) return; built = true;
    document.body.classList.add('blurhud');
    const box = document.createElement('div'); box.id = 'bl';
    box.innerHTML =
      '<canvas id="fx"></canvas>' +
      '<div id="mirror"><div id="mirror-in"></div></div><div id="rpmseg"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div id="stats"><div class="st"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></svg><b id="s-time" class="num">00:00.00</b></div>' +
      '<div class="st"><svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg><span>MÁX</span><b id="s-top" class="num">0</b></div>' +
      '<div class="st"><svg viewBox="0 0 24 24"><path d="M4 20 20 4M14 4h6v6"/></svg><span>DIST</span><b id="s-dist" class="num">0.0 km</b></div></div>' +
      '<div id="bspeed"><b id="b-spd" class="num">0</b><span id="b-unit">km/h</span><em id="b-gear" class="num">N</em></div>' +
      '<div id="bshift"><button id="b-trans" type="button" title="G: alternar câmbio automático / manual">AUTO</button><button id="b-dn" type="button" aria-label="Reduzir marcha (Q)">&#9660;</button><button id="b-up" type="button" aria-label="Subir marcha (E)">&#9650;</button></div>' +
      '<div id="calls"></div>';
    hud.insertBefore(box, hud.firstChild);
    el = { mirror: $('mirror'), spd: $('b-spd'), unit: $('b-unit'), gear: $('b-gear'), trans: $('b-trans'), gearbox: $('bshift'), time: $('s-time'), top: $('s-top'), dist: $('s-dist'), seg: [...document.querySelectorAll('#rpmseg i')], calls: $('calls') };
    fx = $('fx'); fxc = fx.getContext('2d');
  }
  function call(txt, cls) {
    if (!el.calls) return; const d = document.createElement('div'); d.className = 'call ' + (cls || ''); d.textContent = txt; el.calls.appendChild(d);
    while (el.calls.children.length > 3) el.calls.removeChild(el.calls.firstChild); setTimeout(() => d.remove(), 2600);
  }
  return {
    init: build,
    reset() { T = { time: 0, top: 0, dist: 0, drift: 0, air: 0, maxAir: 0, lastTop: 0, callT: 0 }; },
    // chamado todo quadro de jogo
    update(dt, veh, cfg, mode) {
      build(); if (!built) return;
      const mph = cfg.units === 'mph', k = mph ? 2.23694 : 3.6, sp = Math.abs(veh.fwdSpeed) * k, kmh = Math.abs(veh.fwdSpeed) * 3.6;
      if (mode === 'play') { T.time += dt; T.dist += veh.speed * dt; }
      if (sp > T.top) T.top = sp;
      el.spd.textContent = Math.round(sp); el.unit.textContent = mph ? 'mph' : 'km/h';
      el.gear.textContent = veh.gear < 0 ? 'R' : (Math.abs(veh.fwdSpeed) < 0.4 && veh.throttle < 0.05 ? 'N' : veh.gear);
      const man = cfg.trans === 'manual'; el.trans.textContent = man ? 'MANUAL · ' + (veh.P.gears.length - 1) + 'v' : 'AUTO'; el.gearbox.classList.toggle('man', man);
      el.gear.classList.toggle('shiftnow', man && veh.gear > 0 && veh.gear < veh.P.gears.length - 1 && veh.rpm > veh.P.rpmCut * 0.93); // pisca quando é hora de subir a marcha
      el.time.textContent = fmt(T.time); el.top.textContent = Math.round(T.top) + ' ' + (mph ? 'mph' : 'km/h'); el.dist.textContent = mph ? (T.dist / 1609.34).toFixed(1) + ' mi' : (T.dist / 1000).toFixed(1) + ' km';
      const pI = veh.P.idle, pM = veh.P.rpmMax, f = clamp((veh.rpm - pI) / (pM - pI), 0, 1);
      el.seg.forEach((s, i) => { s.className = f > (i + 0.5) / 5 ? (i >= 4 ? 'on red' : 'on') : ''; });
      // avisos (sem pontos)
      if (veh.drifting && veh.onGround) T.drift += dt; else { if (T.drift > 1.2) call('DERRAPAGEM  ' + T.drift.toFixed(1) + ' s', 'gold'); T.drift = 0; }
      if (!veh.onGround) T.maxAir = Math.max(T.maxAir, veh.airT); else { if (T.maxAir > 0.8) call('SALTO  ' + T.maxAir.toFixed(1) + ' s', ''); T.maxAir = 0; }
      if (kmh > 120 && kmh > T.lastTop + 25 && T.time > 5) { T.lastTop = kmh; call('VELOCIDADE MÁXIMA  ' + Math.round(sp) + ' ' + (mph ? 'mph' : 'km/h'), 'gold'); }
    },
    // retângulo do retrovisor em frações da tela (ou null se desligado)
    mirrorRect(cfg, mode) {
      if (!built || cfg.mirror === 'off' || !(mode === 'play')) { if (el.mirror) el.mirror.style.visibility = 'hidden'; return null; }
      el.mirror.style.visibility = 'visible';
      const r = $('mirror-in').getBoundingClientRect(), W = innerWidth, H = innerHeight; if (r.width < 20) return null;
      return { x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H };
    },
    // câmera do retrovisor: do teto/traseira do carro olhando para trás
    mirrorCam(veh) {
      const cs = veh.P.scale, Rm = veh.R, lx = 0, ly = 0.78 * cs, lz = -0.55 * cs, p = veh.p;
      const pos = [p[0] + Rm[0] * lx + Rm[1] * ly + Rm[2] * lz, p[1] + Rm[3] * lx + Rm[4] * ly + Rm[5] * lz, p[2] + Rm[6] * lx + Rm[7] * ly + Rm[8] * lz];
      let f = [-Rm[2], -Rm[5] - 0.02, -Rm[8]]; const l = Math.hypot(f[0], f[1], f[2]); f = [f[0] / l, f[1] / l, f[2] / l];
      let r = [-f[2], 0, f[0]]; const rl = Math.hypot(r[0], r[2]) || 1; r = [r[0] / rl, 0, r[2] / rl];
      const up = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      return { pos, fwd: f, right: r, up, fov: 0.62 };
    },
    // efeito de velocidade (linhas radiais + vinheta)
    fx(cfg, mode, intensity) {
      if (!built) return; const on = cfg.fx !== 'off' && mode === 'play'; const I = on ? intensity : 0;
      const w = Math.round(innerWidth / 2), h = Math.round(innerHeight / 2); if (fx.width !== w) { fx.width = w; fx.height = h; }
      fxc.clearRect(0, 0, w, h); if (I < 0.02) return;
      const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h) / 2;
      const g = fxc.createRadialGradient(cx, cy, R * 0.45, cx, cy, R); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.42 * I).toFixed(3) + ')'); fxc.fillStyle = g; fxc.fillRect(0, 0, w, h);
      const n = Math.round(10 + 34 * I); fxc.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.2832, r0 = R * (0.52 + Math.random() * 0.4), len = R * (0.10 + 0.34 * I) * (0.4 + Math.random());
        fxc.strokeStyle = 'rgba(255,255,255,' + ((0.05 + 0.16 * I) * Math.random()).toFixed(3) + ')'; fxc.lineWidth = 0.6 + Math.random() * 1.8 * I;
        fxc.beginPath(); fxc.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8); fxc.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len) * 0.8); fxc.stroke();
      }
    },
  };
})();
