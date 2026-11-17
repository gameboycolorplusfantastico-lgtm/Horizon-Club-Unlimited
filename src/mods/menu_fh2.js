// ===================== MENUS ESTILO FORZA HORIZON 2 =====================
// Garagem em tela cheia: crachá da montadora, nome, imagem 2D do carro, barras de status (calculadas da física do carro),
// faixa de miniaturas embaixo. A imagem 2D vem de assets/cars/<id>/thumb.png; se não existir, o jogo tira uma "foto" do modelo 3D
// na primeira vez que o carro é carregado neste aparelho e guarda no navegador.
const FH2 = (() => {
  const $ = (id) => document.getElementById(id);
  const THUMB_V = 7, THUMB_CACHE = 'hcu-thumbs-' + THUMB_V;
  let G = null, cars = [], cur = null, focus = null, loading = null, busy = false, built = false, open = false, thumbs = {}, probing = {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // ---- status 0..10 a partir da física do jogo ----
  const defT = (rpm) => { const x = rpm / 1000; if (x < 1) return 150 * x; const t = x < 4.8 ? 250 + 120 * Math.sin((x - 1) / 3.8 * Math.PI * 0.5) : 370 - Math.max(0, x - 6.2) * 90; return Math.max(60, x > 8 ? 0 : t); };
  function peak(P) { let pw = 0, tq = 0; const T = P.torque; for (let r = 800; r <= 9000; r += 100) { let t; if (T) { t = 0; if (r <= T[0][0]) t = T[0][1]; else for (let i = 1; i < T.length; i++) if (r <= T[i][0]) { const a = T[i - 1], b = T[i]; t = a[1] + (b[1] - a[1]) * (r - a[0]) / (b[0] - a[0]); break; } } else t = r > 8000 ? 0 : defT(r); tq = Math.max(tq, t); pw = Math.max(pw, t * r * 2 * Math.PI / 60 / 745.7); } return { hp: pw, nm: tq }; }
  const c10 = (v) => Math.max(0.5, Math.min(10, v));
  function statsFor(c) {
    const P = c.params || {}, mass = P.mass || 1500, mu = P.mu || 1.3, awd = !!P.awd, cdA = P.cdA || 0.68, clA = P.clA == null ? 0.35 : P.clA, eff = P.eff || 0.88, pk = peak(P);
    const vdrag = Math.cbrt(2 * pk.hp * 745.7 * eff / (1.2 * cdA)) * 3.6, top = Math.min(P.vMax ? P.vMax * 3.6 : 999, vdrag);
    const S = { speed: c10((top - 100) / 30), handling: c10(5 + (mu - 1.2) * 10 + (1500 - mass) / 1000 * 2 + clA * 3 + (P.offroad > 1 ? 1 : 0)), accel: c10(pk.hp / (mass / 1000) / 45 + (awd ? 0.8 : 0)), launch: c10(pk.nm / (mass / 1000) / 45 + (awd ? 1.2 : 0)), braking: c10(5 + (mu - 1.2) * 8 + (1500 - mass) / 1500 * 1.5) };
    const avg = (S.speed + S.handling + S.accel + S.launch + S.braking) / 5, pi = Math.round(100 + avg * 90), cls = pi < 400 ? 'D' : pi < 500 ? 'C' : pi < 600 ? 'B' : pi < 700 ? 'A' : pi < 800 ? 'S1' : pi < 900 ? 'S2' : 'X';
    return { S, pi, cls, awd, top: Math.round(top), hp: Math.round(pk.hp) };
  }
  const car = (id) => cars.find((c) => c.id === id);
  // ---- miniaturas 2D ----
  // recorta a foto 2D pelo contorno real do carro (pixels não transparentes): ponta do pneu, teto, para-choques... ficam centralizados e nunca cortados
  function trimThumb(src, done) {
    const im = new Image();
    im.onload = () => {
      try {
        const w = im.naturalWidth, h = im.naturalHeight; if (!w || !h) return done(src);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (d[(y * w + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return done(src);
        const pad = Math.max(2, Math.round(Math.max(x1 - x0, y1 - y0) * 0.015)); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
        const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; c2.getContext('2d').drawImage(im, x0, y0, cw, ch, 0, 0, cw, ch);
        done(c2.toDataURL('image/png'));
      } catch (e) { done(src); }
    };
    im.onerror = () => done(src); im.src = src;
  }
  function probe(c) {
    if (thumbs[c.id] !== undefined || probing[c.id]) return; probing[c.id] = 1;
    const fin = (u) => { thumbs[c.id] = u || null; delete probing[c.id]; paint(); };
    const url = 'assets/cars/' + c.dir + '/thumb.png?v=' + THUMB_V;
    const fallback = () => { let v = null; try { v = localStorage.getItem('hcu-thumb:' + c.id); } catch (e) {} if (v) trimThumb(v, fin); else fin(null); };
    const useBlob = (blob) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => trimThumb(u, fin); im.onerror = fallback; im.src = u; };
    // cache permanente do navegador (Cache Storage): na proxima visita as capas ja estao salvas, mesmo sem o carro ter sido baixado
    const net = () => fetch(url).then((r) => { if (!r.ok) throw 0; const cl = r.clone(); return r.blob().then((b) => { try { if (window.caches) caches.open(THUMB_CACHE).then((ch) => ch.put(url, cl)).catch(() => {}); } catch (e) {} useBlob(b); }); }).catch(fallback);
    try { if (window.caches) caches.open(THUMB_CACHE).then((ch) => ch.match(url)).then((hit) => (hit ? hit.blob().then(useBlob) : net())).catch(net); else net(); } catch (e) { net(); }
  }
  // baixa TODAS as capas em segundo plano (poucas por vez) assim que a lista de carros chega
  let preloading = false;
  function preloadAll() {
    if (preloading) return; preloading = true;
    try { if (window.caches) caches.keys().then((ks) => ks.forEach((k) => { if (k.indexOf('hcu-thumbs-') === 0 && k !== THUMB_CACHE) caches.delete(k); })); } catch (e) {}
    const q = cars.slice(); let run = 0; const pump = () => { while (run < 4 && q.length) { const c = q.shift(); if (thumbs[c.id] !== undefined || probing[c.id]) continue; run++; const iv = setInterval(() => { if (thumbs[c.id] !== undefined) { clearInterval(iv); run--; pump(); } }, 80); probe(c); } }; pump();
  }
  function build() {
    if (built) return; const ui = $('ui'); if (!ui) return; built = true;
    G = document.createElement('div'); G.id = 'garage'; G.hidden = true;
    G.innerHTML =
      '<div class="g-top"><div class="g-now"><span class="g-pi"><b id="g-ncls">A</b><i id="g-npi">0</i></span><span id="g-ncar"></span></div><div class="g-right-top"><div class="g-count">GARAGEM <b id="g-count">0</b></div><button class="g-exit" id="g-exit" aria-label="Sair da garagem">✕ SAIR</button></div></div>' +
      '<div class="g-main">' +
        '<aside class="g-left"><div class="g-badge" id="g-badge">B</div><div class="g-k">DIVISÃO</div><div class="g-v" id="g-div"></div><div class="g-k">MONTADORA</div><div class="g-v" id="g-brand"></div><div class="g-k" id="g-lstat-k">FICHA</div><div class="g-v small" id="g-specs"></div></aside>' +
        '<section class="g-center"><div class="g-head"><button class="g-buy" id="g-ok">USAR ESTE CARRO</button><div class="g-title"><span id="g-tb"></span><b id="g-tn"></b><em id="g-ty"></em></div></div><div class="g-img"><img id="g-img" alt=""><div id="g-noimg" hidden><svg viewBox="0 0 200 80"><path d="M10 58c0-8 4-12 12-14l22-4 16-16c3-3 7-5 12-5h42c6 0 11 2 15 6l14 15 24 5c8 2 13 6 13 13v6c0 3-2 5-5 5h-10a16 16 0 0 0-32 0H74a16 16 0 0 0-32 0H15c-3 0-5-2-5-5z"/><circle cx="58" cy="64" r="10"/><circle cx="154" cy="64" r="10"/></svg><span>Imagem 2D será gerada quando você dirigir este carro</span></div></div><div class="g-state" id="g-state"></div></section>' +
        '<aside class="g-right"><div class="g-class"><div class="g-ci"><b id="g-cls">S2</b><span id="g-pi">925</span></div><div class="g-drive"><svg viewBox="0 0 60 90" id="g-drv"></svg><b id="g-drvt">AWD</b></div></div><div class="g-bars" id="g-bars"></div></aside>' +
      '</div>' +
      '<div class="g-strip" id="g-strip" role="listbox" aria-label="Carros"></div>' +
      '<div class="g-hints"><button id="g-bk"><i class="kb">Esc</i><i class="pd b">B</i>Voltar</button><span><i class="kb">←</i><i class="kb">→</i><i class="pd">◀</i><i class="pd">▶</i>Escolher</span><button id="g-ok2"><i class="kb">Enter</i><i class="pd a">A</i>Selecionar</button></div>';
    ui.appendChild(G);
    $('g-ok').onclick = $('g-ok2').onclick = confirm; $('g-bk').onclick = close; $('g-exit').onclick = close;
    $('g-strip').addEventListener('click', (e) => { const t = e.target.closest('.g-tile'); if (t) { focus = t.dataset.id; paint(); } });
    window.addEventListener('keydown', (e) => {
      if (!open) return; const k = e.code; if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'KeyB'].includes(k)) return; e.stopImmediatePropagation(); e.preventDefault();
      if (k === 'Escape' || k === 'KeyB') close(); else if (k === 'Enter') confirm(); else { const i = cars.findIndex((c) => c.id === focus), n = cars.length; if (n) { focus = cars[(i + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1) + n) % n].id; paint(); } }
    }, true);
    for (const id of ['open-garage', 'garage-btn']) { const b = $(id); if (b) b.addEventListener('click', openG); }
  }
  function openG() { build(); open = true; focus = cur || (cars[0] && cars[0].id); G.hidden = false; paint(); }
  function close() { open = false; if (G) G.hidden = true; }
  function confirm() { const c = car(focus); if (!c || busy) return; if (c.id === cur) { close(); return; } window.__game && window.__game.selectCar(c.id); }
  function bar(label, v) { return '<div class="g-bar"><span>' + label + '</span><i><u style="width:' + (v * 10).toFixed(0) + '%"></u></i><b>' + v.toFixed(1) + '</b></div>'; }
  function paint() {
    if (!built || !G) return; for (const c of cars) probe(c);
    const f = car(focus) || cars[0]; if (!f) return; const st = statsFor(f), cc = car(cur);
    $('g-count').textContent = cars.length; if (cc) { const sc = statsFor(cc); $('g-ncls').textContent = sc.cls; $('g-npi').textContent = sc.pi; $('g-ncar').textContent = cc.name; }
    $('g-badge').textContent = (f.brand || f.name || '?').trim().slice(0, 2).toUpperCase(); $('g-div').textContent = f['class'] || '—'; $('g-brand').textContent = f.brand || '—'; $('g-specs').textContent = f.specs || '';
    $('g-tb').textContent = f.brand || ''; $('g-tn').textContent = f.name; $('g-ty').textContent = f.year || '';
    $('g-cls').textContent = st.cls; $('g-cls').parentNode.className = 'g-ci c-' + st.cls[0]; $('g-pi').textContent = st.pi; $('g-drvt').textContent = st.awd ? 'AWD' : 'RWD';
    const d = (x, y, on) => '<rect x="' + x + '" y="' + y + '" width="10" height="20" rx="3" class="' + (on ? 'on' : '') + '"/>';
    $('g-drv').innerHTML = '<rect x="18" y="8" width="24" height="74" rx="10" class="body"/>' + d(6, 14, st.awd) + d(44, 14, st.awd) + d(6, 56, true) + d(44, 56, true);
    $('g-bars').innerHTML = bar('VELOCIDADE', st.S.speed) + bar('CURVAS', st.S.handling) + bar('ACELERAÇÃO', st.S.accel) + bar('ARRANQUE', st.S.launch) + bar('FREIOS', st.S.braking);
    const im = $('g-img'), no = $('g-noimg'), th = thumbs[f.id]; if (th) { if (im.src !== th) im.src = th; im.hidden = false; no.hidden = true; } else { im.hidden = true; no.hidden = false; }
    const isCur = f.id === cur; $('g-ok').textContent = loading === f.id ? 'BAIXANDO…' : isCur ? 'EM USO · VOLTAR' : 'USAR ESTE CARRO'; $('g-ok').disabled = busy; $('g-ok2').lastChild.textContent = isCur ? 'Voltar' : 'Selecionar';
    $('g-state').textContent = isCur ? 'Carro atual' : (f.bytes ? 'Download de ' + (f.bytes / 1048576).toFixed(1) + ' MB na primeira vez' : '');
    $('g-strip').innerHTML = cars.map((c) => '<button class="g-tile' + (c.id === focus ? ' sel' : '') + (c.id === cur ? ' cur' : '') + '" data-id="' + esc(c.id) + '" role="option" aria-selected="' + (c.id === focus) + '">' + (thumbs[c.id] ? '<img src="' + thumbs[c.id] + '" alt="">' : '<span class="g-ph">' + esc((c.brand || c.name).slice(0, 2).toUpperCase()) + '</span>') + '<small>' + esc(c.name) + '</small></button>').join('');
    const sel = G.querySelector('.g-tile.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  return {
    update(o) { cars = o.cars || cars; preloadAll(); cur = o.current; loading = o.loading || null; busy = !!o.busy; build(); if (!focus) focus = cur; if (open && cur && !loading && !busy && focus === cur) { /* carro trocado: continua aberto */ } paint(); },
    get isOpen() { return open; }, open: openG, close,
    hasThumb(id) { return !!thumbs[id] || (() => { try { return !!localStorage.getItem('hcu-thumb:' + id); } catch (e) { return false; } })(); },
    // tira a foto 2D do carro atual (modelo já carregado no renderizador) e guarda no navegador
    capture(R, veh, c) {
      try {
        if (!c || this.hasThumb(c.id) || thumbs[c.id]) return;
        const url = R.captureCar({ R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0, 0, 0], wheels: veh.wheels.map((w) => ({ d: w.d, steer: w.steer, spin: 0 })), steerA: 0, hModel: veh.P.hCom, scale: veh.P.scale, anchorY: veh.P.anchorY, brake: 0, shadow: null }, { out: 560 });
        if (url) { try { localStorage.setItem('hcu-thumb:' + c.id, url); } catch (e) {} trimThumb(url, (u) => { thumbs[c.id] = u; paint(); }); }
      } catch (e) { console.warn('captura 2D falhou', e); }
    },
    statsFor,
  };
})();
