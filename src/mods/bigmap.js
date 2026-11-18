// ===================== MAPA GRANDE (estilo Forza Horizon) =====================
// M (teclado) · toque no minimapa · Back/View do controle · botão "Mapa" na pausa. Arrastar/rolar/pinça = mover e dar zoom.
// Clique/toque (ou Enter/A no centro da mira) marca um destino, que aparece no minimapa. Imagem: assets/map_full.webp (gerada de tools/mapgen.py).
const BigMap = (() => {
  const $ = (id) => document.getElementById(id);
  let root, cv, cx, img = null, meta = null, loaded = false, shown = false, raf = 0, menuWas = false, lastT = 0;
  const V = { x: 1200, z: -1500, s: 0.5 }, keys = {}, ptr = new Map(); let pinch = 0, moved = 0, padPrev = {}, dpr = 1, W = 0, H = 0;
  const G = () => window.__game;
  function build() {
    if (root) return; const ui = document.body;
    root = document.createElement('div'); root.id = 'bigmap'; root.hidden = true;
    root.innerHTML = '<canvas id="bm-cv"></canvas>' +
      '<div class="bm-top"><div class="bm-title"><b>MAPA</b><span id="bm-pos"></span></div><button class="bm-x" id="bm-x" aria-label="Fechar mapa">✕ FECHAR</button></div>' +
      '<div class="bm-tools"><button id="bm-in" aria-label="Aproximar">+</button><button id="bm-out" aria-label="Afastar">−</button><button id="bm-me" aria-label="Centralizar no carro" title="Centralizar no carro">◎</button><button id="bm-all" aria-label="Mapa todo" title="Ver o mapa todo">▦</button></div>' +
      '<div class="bm-legend"><span><i class="lg-hw"></i>Via expressa / viaduto</span><span><i class="lg-rd"></i>Ruas</span><span><i class="lg-gr"></i>Parques</span><span><i class="lg-bd"></i>Prédios</span><span><i class="lg-wt"></i>Mar</span></div>' +
      '<div class="bm-wp" id="bm-wp" hidden><b>DESTINO</b><span id="bm-wpd"></span><button id="bm-wpx">Remover</button></div>' +
      '<div class="bm-hints"><span><i class="kb">M</i><i class="pd">▭</i>Fechar</span><span><i class="kb">Arrastar</i><i class="pd">✛</i>Mover</span><span><i class="kb">Roda</i><i class="pd">LB·RB</i>Zoom</span><span><i class="kb">Clique</i><i class="pd a">A</i>Marcar destino</span><span><i class="kb">C</i><i class="pd y">Y</i>Meu carro</span></div>';
    ui.appendChild(root); cv = $('bm-cv'); cx = cv.getContext('2d');
    $('bm-x').onclick = () => G().closeMap(); $('bm-in').onclick = () => zoom(1.4); $('bm-out').onclick = () => zoom(1 / 1.4); $('bm-me').onclick = center; $('bm-all').onclick = fitAll;
    $('bm-wpx').onclick = () => { G().waypoint = null; };
    cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }); moved = 0; pinch = 0; });
    cv.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptr.size === 1) { V.x -= dx / V.s; V.z -= dy / V.s; moved += Math.abs(dx) + Math.abs(dy); }
      else if (ptr.size === 2) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch); pinch = d; moved += 99; }
    });
    const up = (e) => { const p = ptr.get(e.pointerId); ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0; if (p && moved < 8 && ptr.size === 0 && e.type === 'pointerup') setWaypointAt(...toWorld(e.clientX, e.clientY)); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => { if (!shown) return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Enter', 'Space'].includes(e.code)) e.preventDefault();
      keys[e.code] = 1; if (e.repeat) return; if (e.code === 'KeyC') center(); if (e.code === 'Enter' || e.code === 'Space') setWaypointAt(V.x, V.z); if (e.code === 'KeyF') fitAll(); }, true);
    addEventListener('keyup', (e) => { keys[e.code] = 0; });
    addEventListener('resize', size);
    const mb = $('map-btn'); if (mb) mb.addEventListener('click', () => G().openMap());
    const mm = $('mmwrap'); if (mm) { mm.style.cursor = 'pointer'; mm.style.pointerEvents = 'auto'; mm.addEventListener('pointerdown', (e) => { e.stopPropagation(); }); mm.addEventListener('click', () => { const g = G(); if (g && g.mode === 'play') g.openMap(); }); }
  }
  function size() { if (!cv) return; dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  const mapW = () => (meta ? 2502 : 2500), mapH = () => (meta ? 3060 : 3000);
  const minS = () => Math.min(W / mapW(), H / mapH()) * 0.96;
  const clampV = () => { V.s = Math.max(minS(), Math.min(2.2, V.s)); const ox = meta ? meta.ox : 8, oz = meta ? meta.oz : -3040; V.x = Math.max(ox - 200, Math.min(ox + mapW() + 200, V.x)); V.z = Math.max(oz - 200, Math.min(oz + mapH() + 200, V.z)); };
  const toWorld = (px, py) => [V.x + (px - W / 2) / V.s, V.z + (py - H / 2) / V.s];
  function zoomAt(px, py, k) { const [wx, wz] = toWorld(px, py); V.s = Math.max(minS(), Math.min(2.2, V.s * k)); V.x = wx - (px - W / 2) / V.s; V.z = wz - (py - H / 2) / V.s; clampV(); }
  function zoom(k) { V.s = Math.max(minS(), Math.min(2.2, V.s * k)); clampV(); }
  function center() { const v = G().veh; if (v) { V.x = v.p[0]; V.z = v.p[2]; } }
  function fitAll() { V.s = minS(); V.x = (meta ? meta.ox : 8) + mapW() / 2; V.z = (meta ? meta.oz : -3040) + mapH() / 2; clampV(); }
  function setWaypointAt(x, z) { const g = G(), w = g.waypoint; if (w && Math.hypot(w.x - x, w.z - z) < 14 / V.s) g.waypoint = null; else g.waypoint = { x, z }; }
  const fmt = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');
  function frame(t) {
    if (!shown) return; raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; const g = G();
    // teclado: mover (WASD/setas) e zoom (+/−)
    const sp = 700 / V.s * dt; if (keys.ArrowLeft || keys.KeyA) V.x -= sp; if (keys.ArrowRight || keys.KeyD) V.x += sp; if (keys.ArrowUp || keys.KeyW) V.z -= sp; if (keys.ArrowDown || keys.KeyS) V.z += sp;
    if (keys.Equal || keys.NumpadAdd) zoom(Math.exp(1.4 * dt)); if (keys.Minus || keys.NumpadSubtract) zoom(Math.exp(-1.4 * dt));
    // controle: analógico move, LB/RB (e gatilhos) dão zoom, A marca, Y centraliza, B fecha
    let pad = null; try { for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected) { pad = p; break; } } catch (e) {}
    if (pad) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v), b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed), ed = (i) => { const v = b(i), r = v && !padPrev[i]; padPrev[i] = v; return r; };
      V.x += dz(pad.axes[0] || 0) * 900 / V.s * dt; V.z += dz(pad.axes[1] || 0) * 900 / V.s * dt; V.z += dz(pad.axes[3] || 0) * 0; 
      if (b(5) || (pad.buttons[7] && pad.buttons[7].value > 0.2)) zoom(Math.exp(1.5 * dt)); if (b(4) || (pad.buttons[6] && pad.buttons[6].value > 0.2)) zoom(Math.exp(-1.5 * dt));
      if (b(12)) V.z -= 700 / V.s * dt; if (b(13)) V.z += 700 / V.s * dt; if (b(14)) V.x -= 700 / V.s * dt; if (b(15)) V.x += 700 / V.s * dt;
      if (ed(0)) setWaypointAt(V.x, V.z); if (ed(3)) center(); if (ed(1)) g.closeMap();
    }
    clampV(); draw(g);
  }
  function draw(g) {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.fillStyle = '#0e2c4c'; cx.fillRect(0, 0, W, H); const v = g.veh; if (!v) return;
    const ox = meta ? meta.ox : 8, oz = meta ? meta.oz : -3040, res = meta ? meta.bigRes || 1 : 1, X = (x) => W / 2 + (x - V.x) * V.s, Y = (z) => H / 2 + (z - V.z) * V.s;
    if (img && loaded) { cx.save(); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high'; cx.translate(X(ox), Y(oz)); cx.scale(V.s * res, V.s * res); cx.drawImage(img, 0, 0); cx.restore(); }
    else { cx.fillStyle = '#cfe3f5'; cx.font = '600 14px sans-serif'; cx.textAlign = 'center'; cx.fillText('Carregando mapa…', W / 2, H / 2); }
    // destino
    const wp = g.waypoint; const bar = $('bm-wp');
    if (wp) { const px = X(wp.x), py = Y(wp.z); cx.save(); cx.translate(px, py); cx.fillStyle = '#ffe21a'; cx.strokeStyle = '#0a0e14'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, -22, 10, Math.PI * 0.8, Math.PI * 2.2); cx.lineTo(0, 0); cx.closePath(); cx.stroke(); cx.fill(); cx.fillStyle = '#0a0e14'; cx.beginPath(); cx.arc(0, -22, 3.5, 0, 7); cx.fill(); cx.restore();
      $('bm-wpd').textContent = fmt(Math.hypot(wp.x - v.p[0], wp.z - v.p[2])); bar.hidden = false; } else bar.hidden = true;
    // carro: seta amarela com brilho, apontando para onde ele olha
    const px = X(v.p[0]), py = Y(v.p[2]), pul = 0.5 + 0.5 * Math.sin(performance.now() / 280); cx.save(); cx.translate(px, py);
    cx.strokeStyle = 'rgba(255,176,46,' + (0.55 - 0.35 * pul) + ')'; cx.lineWidth = 2; cx.beginPath(); cx.arc(0, 0, 14 + 10 * pul, 0, 7); cx.stroke();
    cx.rotate(Math.PI - v.yaw); cx.shadowColor = 'rgba(0,0,0,.6)'; cx.shadowBlur = 6; cx.fillStyle = '#ffb02e'; cx.strokeStyle = '#0a0e14'; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(0, -14); cx.lineTo(10, 11); cx.lineTo(0, 6); cx.lineTo(-10, 11); cx.closePath(); cx.stroke(); cx.fill(); cx.restore();
    // mira central (onde o Enter/A marca o destino)
    cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(W / 2 - 9, H / 2); cx.lineTo(W / 2 + 9, H / 2); cx.moveTo(W / 2, H / 2 - 9); cx.lineTo(W / 2, H / 2 + 9); cx.stroke();
    $('bm-pos').textContent = 'zoom ' + Math.round(V.s / minS() * 100) + '%';
  }
  function load() {
    if (img) return; const g = G(), c = g && g.city; if (!c || !c.minimap) return; meta = Object.assign({ ox: 8, oz: -3040, bigRes: 1 }, c.minimap);
    img = new Image(); img.onload = () => { loaded = true; }; img.onerror = () => { img.onerror = null; img.src = 'assets/' + meta.img; meta.bigRes = meta.res; }; img.src = 'assets/' + (meta.big || meta.img);
  }
  function show(on) {
    build(); if (on === shown) return; shown = on; const menu = $('menu');
    if (on) { load(); size(); center(); V.s = Math.max(minS() * 2.6, 0.32); clampV(); root.hidden = false; menuWas = menu && !menu.hidden; if (menuWas) menu.hidden = true; lastT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    else { root.hidden = true; cancelAnimationFrame(raf); for (const k in keys) keys[k] = 0; ptr.clear(); if (menuWas && menu) menu.hidden = false; menuWas = false; }
  }
  const boot = () => { build(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return { show, get open() { return shown; } };
})();
