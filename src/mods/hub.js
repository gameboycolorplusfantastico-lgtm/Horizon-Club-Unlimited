// ===================== TELA INICIAL + HUB (estilo Forza Horizon 2) =====================
// 1) Tela inicial: carro aleatório num ponto bonito do mapa (a ponte sobre o mar), logo, barra de download de todos os arquivos
//    (mod preload.js) e "PRESSIONE START".  2) Hub com abas (INÍCIO, SOCIAL, CLUBE, RIVAIS, CARROS, COMUNIDADE, PROGRESSO, LOJA) e blocos.
// 3) Tela "pronto para largar" (COMEÇAR, PONTO DE LARGADA, TRÁFEGO, OPÇÕES). Muitas opções ainda não existem: ficam marcadas "EM BREVE".
const Hub = (() => {
  const $ = (id) => document.getElementById(id);
  const G = () => window.__game;
  // cenário da tela inicial: ponte sobre o mar (carro na pista, torres e mar ao fundo)
  const SCENE = { x: 1436, y: 28.6, z: -702, yaw: 0.1 };
  const SPOTS = [
    { n: 'Centro da cidade', p: null },
    { n: 'Ponte sobre o mar', p: SCENE },
    { n: 'Costa leste', p: { x: 1555, y: 10.0, z: -1480, yaw: 0 } },
    { n: 'Mirante nordeste', p: { x: 1927, y: 52.9, z: -2649, yaw: -0.59 } },
  ];
  const DENS = [['off', 'Desligado', 0], ['low', 'Baixo', 14], ['med', 'Médio', 26], ['high', 'Alto', 44]];
  const IC = {
    pin: '<path d="M50 92S20 58 20 40a30 30 0 0 1 60 0c0 18-30 52-30 52z"/><circle cx="50" cy="40" r="11"/>',
    slot: '<rect x="12" y="24" width="70" height="52" rx="6"/><path d="M35 24v52M59 24v52M90 36v20"/><circle cx="24" cy="50" r="5"/><circle cx="47" cy="50" r="5"/><circle cx="70" cy="50" r="5"/>',
    trophy: '<path d="M30 12h40v24a20 20 0 0 1-40 0zM30 20H12c0 16 8 24 20 26M70 20h18c0 16-8 24-20 26M50 56v18M32 90h36M38 74h24"/>',
    star: '<circle cx="50" cy="50" r="40"/><path d="M50 24l8 17 18 2-14 13 4 18-16-10-16 10 4-18-14-13 18-2z"/>',
    chart: '<path d="M8 80l24-32 20 16 24-36 20 24"/><path d="M8 90h84"/>',
    car: '<path d="M6 68h88V56l-12-4-12-20H34L22 52 6 58z"/><circle cx="29" cy="70" r="10"/><circle cx="73" cy="70" r="10"/>',
    gear: '<circle cx="50" cy="50" r="15"/><path d="M50 10v16M50 74v16M10 50h16M74 50h16M22 22l11 11M67 67l11 11M78 22L67 33M33 67L22 78"/>',
    people: '<circle cx="36" cy="32" r="13"/><circle cx="70" cy="38" r="10"/><path d="M10 86c0-20 11-30 26-30s26 10 26 30M58 82c0-12 6-20 16-20s18 8 18 22"/>',
    chat: '<path d="M10 18h80v52H46L26 88V70H10z"/><path d="M26 38h48M26 52h30"/>',
    flag: '<path d="M22 92V10M24 12h56L68 30l12 18H24"/>',
    cam: '<rect x="8" y="28" width="84" height="56" rx="6"/><circle cx="50" cy="56" r="16"/><path d="M32 28l7-12h22l7 12"/>',
    bag: '<path d="M18 34h64l6 54H12zM36 34v-6a14 14 0 0 1 28 0v6"/>',
    brush: '<path d="M72 8l20 20-36 36-20-20zM34 44c-16 4-8 26-24 32 22 8 40-4 42-16"/>',
    wrench: '<path d="M64 12a22 22 0 0 0-20 30L10 76l14 14 34-34a22 22 0 0 0 30-20L74 48 62 44 58 32z"/>',
    radio: '<rect x="8" y="36" width="84" height="50" rx="6"/><circle cx="66" cy="62" r="15"/><path d="M22 54h22M22 68h22M28 36l44-24"/>',
    grid: '<path d="M30 92V8M70 92V8"/><rect x="38" y="20" width="24" height="26" rx="6"/><rect x="38" y="58" width="24" height="26" rx="6"/>',
    key: '<circle cx="30" cy="50" r="18"/><path d="M48 50h42M76 50v14M64 50v10"/>',
  };
  const svg = (k) => '<svg viewBox="0 0 100 100" aria-hidden="true">' + (IC[k] || '') + '</svg>';
  // grade de 12 colunas x 2 linhas: c = coluna (início/fim), r = linha
  const T = (t, o) => Object.assign({ t }, o);
  const TABS = [
    { id: 'home', n: 'Início', tiles: [
      T('Mundo aberto', { c: '1/6', r: '1/3', photo: 0, sub: 'Passeio livre pela cidade', act: 'drive', dot: 0 }),
      T('Garagem', { c: '6/9', r: '1/2', ic: 'car', act: 'garage' }),
      T('Opções', { c: '9/13', r: '1/2', ic: 'gear', act: 'opts' }),
      T('Rádio', { c: '6/10', r: '2/3', ic: 'radio', act: 'info', msg: 'Rádio: 4 estações, tecla N ou botão RÁDIO durante o jogo' }),
      T('Carro atual', { c: '10/13', r: '2/3', yel: true, ic: 'key', act: 'carname' }),
    ] },
    { id: 'social', n: 'Social', tiles: [
      T('Amigos', { c: '1/5', r: '1/3', ic: 'people', soon: 1 }), T('Festa de jogo', { c: '5/9', r: '1/2', ic: 'flag', soon: 1 }),
      T('Mensagens', { c: '9/13', r: '1/2', ic: 'chat', soon: 1 }), T('Convites', { c: '5/13', r: '2/3', ic: 'star', soon: 1 }),
    ] },
    { id: 'club', n: 'Clube [HCU]', tiles: [
      T('Meu clube', { c: '1/6', r: '1/3', photo: 1, soon: 1 }), T('Procurar clube', { c: '6/10', r: '1/2', ic: 'people', soon: 1 }),
      T('Criar clube', { c: '10/13', r: '1/2', ic: 'flag', soon: 1 }), T('Classificação', { c: '6/13', r: '2/3', ic: 'chart', soon: 1 }),
    ] },
    { id: 'rivals', n: 'Rivais', dot: 1, tiles: [
      T('Desafios', { c: '1/5', r: '1/3', ic: 'flag', soon: 1, bdg: 1 }), T('Tempo na pista', { c: '5/9', r: '1/2', ic: 'chart', soon: 1 }),
      T('Duelos', { c: '9/13', r: '1/2', photo: 2, soon: 1 }), T('Placar', { c: '5/13', r: '2/3', ic: 'trophy', soon: 1 }),
    ] },
    { id: 'cars', n: 'Carros', tiles: [
      T('Garagem', { c: '1/7', r: '1/3', carimg: 1, act: 'garage', sub: 'Escolher o carro' }), T('Loja de carros', { c: '7/10', r: '1/2', ic: 'bag', soon: 1 }),
      T('Pintura', { c: '10/13', r: '1/2', ic: 'brush', soon: 1 }), T('Afinação', { c: '7/10', r: '2/3', ic: 'wrench', soon: 1 }),
      T('Coleção', { c: '10/13', r: '2/3', yel: true, ic: 'car', act: 'count' }),
    ] },
    { id: 'comm', n: 'Comunidade', tiles: [
      T('Fotos', { c: '1/6', r: '1/3', photo: 2, ic: 'cam', soon: 1 }), T('Pinturas', { c: '6/10', r: '1/2', ic: 'brush', soon: 1 }),
      T('Afinações', { c: '10/13', r: '1/2', ic: 'wrench', soon: 1 }), T('Eventos', { c: '6/13', r: '2/3', ic: 'flag', soon: 1 }),
    ] },
    { id: 'prog', n: 'Progresso', dot: 1, tiles: [
      T('Progresso da viagem', { c: '1/5', r: '1/2', ic: 'pin', soon: 1 }), T('Giro da sorte', { c: '5/7', r: '1/2', ic: 'slot', soon: 1 }),
      T('Lista de desejos', { c: '7/11', r: '1/2', photo: 1, sub: 'Carros que faltam', soon: 1 }), T('Conquistas', { c: '11/13', r: '1/2', ic: 'trophy', soon: 1 }),
      T('Promo Horizon', { c: '1/5', r: '2/3', photo: 2, soon: 1 }), T('Vantagens', { c: '5/7', r: '2/3', ic: 'star', soon: 1, bdg: 1 }),
      T('Estatísticas', { c: '7/9', r: '2/3', ic: 'chart', soon: 1 }), T('Campeonatos ganhos', { c: '9/13', r: '2/3', yel: true, vs: 1, soon: 1 }),
    ] },
    { id: 'shop', n: 'Loja', tiles: [
      T('Carros', { c: '1/6', r: '1/3', carimg: 1, soon: 1 }), T('Pinturas', { c: '6/10', r: '1/2', ic: 'brush', soon: 1 }),
      T('Adesivos', { c: '10/13', r: '1/2', ic: 'star', soon: 1 }), T('Pacotes', { c: '6/13', r: '2/3', ic: 'bag', soon: 1 }),
    ] },
  ];
  const RACE = [
    T('Começar', { c: '', photo: 0, act: 'go', big: 1, sub: 'Dirigir pela cidade' }),
    T('Ponto de largada', { act: 'spot', ic: 'grid' }),
    T('Tráfego', { act: 'dens', bars: 1 }),
    T('Opções', { act: 'opts', checks: 1 }),
  ];
  let root, state = 'loading', tab = 0, sel = 0, selTab = {}, snaps = [], snapT = 0, wantSnap = true, t = 0, spotI = 0, scene = false, shown = false, restored = false;
  const touch = () => matchMedia && matchMedia('(pointer:coarse)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const carNow = () => { const g = G(); if (!g) return null; const id = g.veh && g.veh.carId; return g.cars.find((c) => c.id === id) || null; };
  const fmt = (b) => (b / 1048576).toFixed(b > 1e8 ? 0 : 1);

  function build() {
    const ui = $('ui'); root = document.createElement('div'); root.id = 'fhx'; root.className = 'loading';
    root.innerHTML =
      '<div id="fx-back"></div><div id="fx-vig"></div>' +
      '<section id="fx-title"><div class="fx-logo"><img src="assets/logo.png" alt="Horizon Club Unlimited"><div class="fx-sub">Mundo aberto</div></div>' +
      '<div id="fx-load"><div class="fx-lt"><span id="fx-lt1">Preparando…</span><span id="fx-lt2">0%</span></div><div class="fx-bar"><i id="fx-bar"></i></div><div class="fx-file" id="fx-file"></div><button id="fx-skip" hidden>Continuar (o resto baixa depois)</button></div>' +
      '<div id="fx-press" hidden></div><div id="fx-corner"></div></section>' +
      '<section id="fx-hub" hidden><div class="fx-top"><div class="fx-who"><span class="fx-pi"><b id="fx-cls">A</b><i id="fx-pi">700</i></span><span id="fx-car">—</span></div><div class="fx-me"><span class="fx-lvl">1</span><span>[HCU] Piloto</span><span class="fx-cr">CR 0</span></div></div>' +
      '<div class="fx-tabs" id="fx-tabs"></div><div class="fx-grid" id="fx-grid"></div>' +
      '<div class="fx-bottom" id="fx-bottom"></div></section>' +
      '<section id="fx-race" hidden><div><div class="fx-rlabel"><span>Passeio livre</span> / <b>Mundo aberto</b></div><div class="fx-rgrid" id="fx-rgrid"></div></div><div class="fx-bottom" id="fx-bottom2" style="position:absolute;left:max(5vw,28px);bottom:max(10px,env(safe-area-inset-bottom,0px))"></div></section>';
    ui.appendChild(root);
    $('fx-skip').addEventListener('click', () => { if (Preload.skip()) $('fx-skip').hidden = true; });
    $('fx-tabs').addEventListener('click', (e) => { const b = e.target.closest('.fx-tab'); if (b) { setTab(+b.dataset.i); } });
    $('fx-grid').addEventListener('click', (e) => { const b = e.target.closest('.fx-tile'); if (b) { sel = +b.dataset.i; mark(); activate(b); } });
    $('fx-grid').addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const b = e.target.closest('.fx-tile'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); } });
    $('fx-rgrid').addEventListener('click', (e) => { const b = e.target.closest('.fx-tile'); if (b) { sel = +b.dataset.i; mark(); activate(b); } });
    $('fx-rgrid').addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const b = e.target.closest('.fx-tile'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); } });
    $('fx-bottom').addEventListener('click', onBottom); $('fx-bottom2').addEventListener('click', onBottom);
    root.addEventListener('pointerdown', (e) => { if (state === 'title' && !e.target.closest('button')) enterHub(); });
    addEventListener('keydown', onKey, true);
    $('fx-corner').textContent = 'Horizon Club Unlimited';
    requestAnimationFrame(loop);
  }
  function onBottom(e) { const b = e.target.closest('button'); if (!b) return; const k = b.dataset.k; if (k === 'ok') act('ok'); else if (k === 'back') act('back'); else if (k === 'fs') act('fs'); }
  function hints(el, items) {
    const pad = document.body.classList.contains('pad-ui');
    const g = (cls, k, a, label) => '<button class="' + cls + '" data-k="' + a + '"><i>' + k + '</i>' + label + '</button>';
    el.innerHTML = pad ? items.map((x) => g(x[0], x[1], x[3], x[4])).join('') : items.map((x) => g('k', x[2], x[3], x[4])).join('');
  }
  const bottomItems = () => [['a', 'A', 'Enter', 'ok', 'Selecionar'], ['b', 'B', 'Esc', 'back', 'Voltar'], ['x', 'LB/RB', 'Q/E', 'tab', 'Trocar aba'], ['y', 'Y', 'F', 'fs', 'Tela cheia']];

  // ---------- fluxo ----------
  function setState(s) {
    state = s; root.classList.toggle('inhub', s === 'hub' || s === 'race');
    $('fx-title').hidden = s !== 'title' && s !== 'loading'; $('fx-hub').hidden = s !== 'hub'; $('fx-race').hidden = s !== 'race';
    if (s === 'hub') { renderHub(); } else if (s === 'race') { renderRace(); }
  }
  function ready() { // mundo carregado: mostra a cena 3D e o "PRESSIONE START"
    scene = true; root.classList.add('scene'); root.classList.remove('loading'); $('fx-load').hidden = true;
    const p = $('fx-press'); p.hidden = false; setPress(); setState('title'); applyDensity();
  }
  function setPress() {
    const p = $('fx-press'); if (!p) return; const pad = document.body.classList.contains('pad-ui');
    p.textContent = touch() ? 'Toque para começar' : pad ? 'Pressione START' : 'Pressione ENTER';
  }
  function enterHub() {
    if (state !== 'title') return; setState('hub');
    const g = G(), sv = window.__savedCar; // volta para o carro salvo do jogador (o da tela inicial é sorteado)
    if (!restored && g) { restored = true; if (sv && g.veh && g.veh.carId !== sv && g.cars.some((c) => c.id === sv)) g.selectCar(sv); }
  }
  function carImg(c) { return c ? 'assets/cars/' + c.dir + '/thumb.png?v=7' : ''; }
  function renderHub() {
    const tb = $('fx-tabs'); tb.innerHTML = '<span class="lb">LB</span>' + TABS.map((x, i) => '<button class="fx-tab' + (i === tab ? ' on' : '') + (x.dot ? ' dot' : '') + '" data-i="' + i + '">' + esc(x.n) + '</button>').join('') + '<span class="lb">RB</span>';
    const gr = $('fx-grid'), c = carNow(), cars = (G() && G().cars) || [];
    gr.innerHTML = TABS[tab].tiles.map((x, i) => {
      let inner = '<div class="tt">' + esc(x.t) + '</div>';
      if (x.photo !== undefined) { const s = snaps[x.photo % Math.max(1, snaps.length)]; inner = '<div class="ph" style="' + (s ? 'background-image:url(' + s + ')' : 'background:linear-gradient(135deg,#2a5a8a,#0c1e33)') + '"></div>' + inner; }
      if (x.carimg && c) inner = '<div class="ic" style="padding:16% 6% 6%;color:inherit"><img src="' + carImg(c) + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain"></div>' + inner;
      else if (x.ic) inner = '<div class="ic">' + svg(x.ic) + '</div>' + inner;
      if (x.vs) inner += '<div class="fx-vs"><div><b>6</b>/168<br>VOCÊ</div><em>VS</em><div><b>6</b>/168<br>RIVAL</div></div>';
      if (x.act === 'carname') inner += '<div class="sub" style="color:#222">' + esc(c ? c.name : '—') + '</div>';
      if (x.act === 'count') inner += '<div class="sub" style="color:#222">' + cars.length + ' carros</div>';
      if (x.sub && !x.act) inner += '<div class="sub">' + esc(x.sub) + '</div>'; else if (x.sub) inner += '<div class="sub">' + esc(x.sub) + '</div>';
      if (x.soon) inner += '<div class="soon">EM BREVE</div>'; if (x.bdg) inner += '<div class="bdg">' + x.bdg + '</div>';
      return '<button class="fx-tile' + (x.photo !== undefined ? ' photo' : '') + (x.yel ? ' yel' : '') + '" data-i="' + i + '" style="grid-column:' + x.c + ';grid-row:' + x.r + '">' + inner + '</button>';
    }).join('');
    sel = Math.min(selTab[tab] || 0, TABS[tab].tiles.length - 1); mark();
    const cs = carNow(), FH = typeof FH2 !== 'undefined' ? FH2 : null;
    $('fx-car').textContent = cs ? cs.name.toUpperCase() : '—';
    try { if (cs && FH) { const st = FH.statsFor(cs); $('fx-cls').textContent = String(st.cls).charAt(0); $('fx-pi').textContent = st.pi; } } catch (e) {}
    hints($('fx-bottom'), bottomItems());
  }
  function densLabel() { const l = (G() && G().cfg.traffic === 'off') ? 'off' : ((G() && G().cfg.trafficLvl) || 'med'); return DENS.find((d) => d[0] === l) || DENS[2]; }
  function renderRace() {
    const gr = $('fx-rgrid'), d = densLabel(), lvl = DENS.findIndex((x) => x[0] === d[0]);
    gr.innerHTML = RACE.map((x, i) => {
      let inner = '<div class="tt">' + esc(x.t) + '</div>';
      if (x.photo !== undefined) inner = '<div class="ph" style="' + (snaps[0] ? 'background-image:url(' + snaps[0] + ')' : 'background:linear-gradient(135deg,#2a5a8a,#0c1e33)') + '"></div>' + inner;
      if (x.ic) inner = '<div class="ic">' + svg(x.ic) + '</div>' + inner;
      if (x.bars) inner += '<div class="fx-bars">' + [1, 2, 3].map((n) => '<i style="height:' + (lvl >= n ? 38 + n * 18 : 18) + '%;' + (lvl >= n ? 'background:#9aa3ad' : '') + '"></i>').join('') + '</div>';
      if (x.checks) inner += '<div class="fx-checks"><i></i><i></i></div>';
      if (x.act === 'spot') inner += '<div class="sub">' + esc(SPOTS[spotI].n) + '</div>';
      if (x.act === 'dens') inner += '<div class="sub">' + esc(d[1]) + '</div>';
      if (x.sub) inner += '<div class="sub">' + esc(x.sub) + '</div>';
      return '<button class="fx-tile' + (x.photo !== undefined ? ' photo' : '') + '" data-i="' + i + '">' + inner + '</button>';
    }).join('');
    sel = 0; mark(); hints($('fx-bottom2'), bottomItems().filter((x) => x[3] !== 'tab'));
  }
  function mark() {
    const gr = state === 'race' ? $('fx-rgrid') : $('fx-grid'); if (!gr) return;
    for (const b of gr.children) b.classList.toggle('sel', +b.dataset.i === sel);
    if (state === 'hub') selTab[tab] = sel;
  }
  function setTab(i) { tab = (i + TABS.length) % TABS.length; sel = selTab[tab] || 0; renderHub(); }
  function toast(m) { const e = $('toast'); if (!e) return; e.textContent = m; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2400); const h = $('hud'); if (h && h.hidden) { /* toast fica dentro do HUD; no hub usamos o rótulo do rodapé */ const b = $('fx-corner'); if (b) { b.textContent = m; setTimeout(() => (b.textContent = 'Horizon Club Unlimited'), 2600); } } }
  function applyDensity() {
    const g = G(), d = densLabel(); if (typeof Traffic === 'undefined') return;
    if (g) { Traffic.cfg.count = d[2] || Traffic.cfg.count; }
  }
  function setDens(dir) {
    const g = G(); if (!g) return; const cur = DENS.findIndex((x) => x[0] === densLabel()[0]), n = (cur + (dir || 1) + DENS.length) % DENS.length, d = DENS[n];
    if (d[0] === 'off') g.cfg.traffic = 'off'; else { g.cfg.traffic = 'on'; g.cfg.trafficLvl = d[0]; }
    g.save(); if (typeof Traffic !== 'undefined') { Traffic.cfg.count = d[2] || Traffic.cfg.count; if (d[2]) Traffic.setCount(d[2]); else Traffic.clear(); }
    renderRace();
  }
  function activate(b) {
    const list = state === 'race' ? RACE : TABS[tab].tiles, x = list[+b.dataset.i]; if (!x) return;
    switch (x.act) {
      case 'drive': setState('race'); return;
      case 'garage': { const k = $('open-garage'); if (k) k.click(); return; }
      case 'opts': { const k = $('open-opts'); if (k) k.click(); return; }
      case 'go': { const k = $('start'); if (k && !k.disabled) k.click(); return; }
      case 'spot': spotI = (spotI + 1) % SPOTS.length; renderRace(); mark(); return;
      case 'dens': setDens(1); return;
      case 'info': toast(x.msg || ''); return;
      case 'carname': case 'count': { const k = $('open-garage'); if (k) k.click(); return; }
    }
    if (x.soon) toast(x.t + ': em breve');
  }
  // ---------- entrada (teclado / controle / toque) ----------
  function moveSel(dir) {
    const gr = state === 'race' ? $('fx-rgrid') : $('fx-grid'); const L = [...gr.children]; if (!L.length) return;
    const cur = L[sel] || L[0], r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = -1, bs = 1e9;
    L.forEach((el, i) => { if (el === cur) return; const q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy; const m = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy, o = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx); if (m < 4) return; const s = m + o * 2; if (s < bs) { bs = s; best = i; } });
    if (best >= 0) { sel = best; mark(); }
  }
  function act(k) {
    if (state === 'loading') { if (k === 'fs') return; return; }
    if (state === 'title') { if (k === 'fs') return; if (k !== 'back') enterHub(); return; }
    if (k === 'tabL' && state === 'hub') { setTab(tab - 1); return; }
    if (k === 'tabR' && state === 'hub') { setTab(tab + 1); return; }
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { moveSel(k); return; }
    if (k === 'ok' || k === 'start') { const gr = state === 'race' ? $('fx-rgrid') : $('fx-grid'), b = gr.children[sel]; if (b) activate(b); return; }
    if (k === 'back') { if (state === 'race') setState('hub'); return; }
  }
  const KMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyQ: 'tabL', KeyE: 'tabR', PageUp: 'tabL', PageDown: 'tabR', Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back' };
  function onKey(e) {
    if (!active() || !e.isTrusted) return; const c = e.code;
    if (c === 'KeyF') return; // tela cheia: tratada pelo menu_pro
    if (state === 'title' || state === 'loading') { if (state === 'title' && c !== 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); enterHub(); } return; }
    const k = KMAP[c]; if (!k) return; e.preventDefault(); e.stopImmediatePropagation(); setPadMode(false); act(k);
  }
  const setPadMode = () => {};
  const active = () => !!root && !root.hidden;

  // ---------- laço: visibilidade, textos que mudam ----------
  let lastPad = null;
  function loop() {
    requestAnimationFrame(loop); const g = G(); const mode = g ? g.mode : 'boot';
    const modal = (typeof FH2 !== 'undefined' && FH2.isOpen) || ($('p-opts') && !$('p-opts').hidden);
    const vis = (mode === 'menu' || mode === 'loading' || mode === 'boot' || !g) && !modal;
    if (root.hidden === vis) { root.hidden = !vis; if (vis && state === 'hub') renderHub(); }
    document.body.classList.toggle('hub-on', vis);
    const pad = document.body.classList.contains('pad-ui'); if (pad !== lastPad) { lastPad = pad; if (state === 'title') setPress(); if (state === 'hub') hints($('fx-bottom'), bottomItems()); if (state === 'race') hints($('fx-bottom2'), bottomItems().filter((x) => x[3] !== 'tab')); }
    if (state === 'hub' && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('fx-tile')) document.activeElement.blur();
  }

  // ---------- download (barra) ----------
  function dl(s) {
    const f = Math.min(1, s.done / s.total), p = $('fx-bar'); if (!p) return;
    p.style.transform = 'scaleX(' + Math.max(0.02, f * 0.9) + ')';
    $('fx-lt1').textContent = 'Baixando os arquivos do jogo'; $('fx-lt2').textContent = Math.round(f * 90) + '%';
    $('fx-file').textContent = fmt(s.done) + ' / ' + fmt(s.total) + ' MB · ' + s.nDone + ' de ' + s.files + ' arquivos · ' + (s.label || '');
    $('fx-skip').hidden = !(s.ess && s.stage === 'run');
  }
  function prep(f, txt) { // fase final (texturas, colisão): 90..100%
    const p = $('fx-bar'); if (!p || state !== 'loading') return; p.style.transform = 'scaleX(' + Math.max(0.02, 0.9 + f * 0.1) + ')'; $('fx-lt2').textContent = Math.round(90 + f * 10) + '%'; if (txt) { $('fx-lt1').textContent = txt; $('fx-file').textContent = ''; } $('fx-skip').hidden = true;
  }
  // ---------- câmera e foto da cena ----------
  function cam(dt, veh) {
    t += dt; const S = veh.P.scale, p = veh.p, hub = state === 'hub' || state === 'race';
    const az = (hub ? 0.95 : 0.62) + Math.sin(t * 0.17) * (hub ? 0.18 : 0.5), d = (6.6 + Math.sin(t * 0.11) * 0.7 + (hub ? 1 : 0)) * S, h = (0.52 + 0.1 * Math.sin(t * 0.23)) * S;
    const ang = veh.yaw + az, pos = [p[0] + Math.sin(ang) * d, p[1] + h, p[2] + Math.cos(ang) * d], tg = [p[0], p[1] + 0.5 * S, p[2]];
    const f = [tg[0] - pos[0], tg[1] - pos[1], tg[2] - pos[2]], l = Math.hypot(f[0], f[1], f[2]) || 1;
    return { pos, f: [f[0] / l, f[1] / l, f[2] / l], fov: 0.64 };
  }
  function snap(canvas) { // chamado logo depois do render: guarda 3 fotos da cena para os blocos
    if (!wantSnap || state === 'loading' || !canvas) return; const now = performance.now(); if (now - snapT < 2600) return; snapT = now;
    try { const c = document.createElement('canvas'); c.width = 420; c.height = 236; c.getContext('2d').drawImage(canvas, 0, 0, 420, 236); snaps.push(c.toDataURL('image/jpeg', 0.78)); if (snaps.length >= 3) wantSnap = false; } catch (e) { wantSnap = false; }
  }
  function spawn() { const s = SPOTS[spotI].p; return s || null; }
  build();
  return {
    dl, prep, ready, cam, snap, spawn, act, SCENE,
    get wantSnap() { return wantSnap; }, get active() { return active; }, get isActive() { return active(); }, get sceneOn() { return scene; }, set sceneOn(v) { scene = v; },
    get state() { return state; }, density() { return densLabel(); },
  };
})();
