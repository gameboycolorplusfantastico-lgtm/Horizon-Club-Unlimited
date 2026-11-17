// ===================== MENU PRO =====================
// 1) Tela cheia: botão no menu inicial, no menu de pausa, ícone flutuante, tecla F e opção "tela cheia ao começar".
// 2) Navegação dos menus por controle (direcional / analógico esquerdo / A / B / Y / Start) e por teclado (setas, Enter, Esc),
//    com cursor amarelo bem visível e dicas de botões embaixo. Nada disso mexe no jogo em si: só atua com o menu aberto.
(() => {
  const $ = (id) => document.getElementById(id);
  const doc = document, root = doc.documentElement, body = doc.body, menu = $('menu');
  if (!menu) return;
  const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
  const mode = () => (window.__game ? window.__game.mode : 'boot');
  const menuOn = () => !menu.hidden;
  const garageOpen = () => typeof FH2 !== 'undefined' && FH2.isOpen;
  const now = () => performance.now();

  // ---------------- tela cheia ----------------
  const reqFs = root.requestFullscreen || root.webkitRequestFullscreen;
  const canFs = !!reqFs && doc.fullscreenEnabled !== false;
  const isFs = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  let flashT = 0, hintKey = '';
  function flash(msg) { const mh = $('mhints'); if (!mh) return; mh.textContent = msg; hintKey = ''; clearTimeout(flashT); flashT = setTimeout(() => { hintKey = ''; renderHints(); }, 4200); }
  function toggleFs() {
    if (!canFs) return;
    const fail = () => flash('O navegador só libera a tela cheia com um clique ou toque. Use o botão com o mouse/toque ou a tecla F.');
    try {
      const p = isFs() ? (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc) : reqFs.call(root, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(fail);
    } catch (e) { fail(); }
  }
  function syncFs() {
    const on = isFs(); body.classList.toggle('is-fs', on); body.classList.toggle('nofs', !canFs);
    for (const el of doc.querySelectorAll('[data-fs]')) { const s = el.querySelector('span') || el; s.textContent = on ? 'Sair da tela cheia' : 'Tela cheia'; }
    const f = $('fs-float'); if (f) { const t = (on ? 'Sair da tela cheia' : 'Tela cheia') + ' (F)'; f.title = t; f.setAttribute('aria-label', t); }
  }
  doc.addEventListener('fullscreenchange', syncFs); doc.addEventListener('webkitfullscreenchange', syncFs);
  for (const id of ['fs-start', 'fs-float']) { const b = $(id); if (b) b.addEventListener('click', toggleFs); } // o #fs-btn da pausa já é ligado no main.js
  const faVal = () => (LS('hcu-fs-auto') === 'on' ? 'on' : 'off');
  const syncFa = () => { for (const b of doc.querySelectorAll('.seg-fa button')) b.classList.toggle('on', b.dataset.v === faVal()); };
  const fa = doc.querySelector('.seg-fa'); if (fa) fa.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { LS('hcu-fs-auto', b.dataset.v); syncFa(); } });
  const st = $('start'); if (st) st.addEventListener('click', () => { if (faVal() === 'on' && !isFs()) toggleFs(); });
  syncFs(); syncFa();

  // ---------------- painéis ----------------
  const PANELS = ['p-start', 'p-opts', 'p-pause'];
  const activePanel = () => PANELS.map($).find((p) => p && !p.hidden);
  function items() {
    const p = activePanel(), out = [];
    if (p) for (const b of p.querySelectorAll('button')) if (!b.disabled && b.offsetParent !== null) out.push(b);
    const f = $('fs-float'); if (f && f.offsetParent !== null) out.push(f);
    return out;
  }
  function defaultItem(L) {
    const p = activePanel(), id = p && p.id;
    if (id === 'p-start') return L.find((b) => b.id === 'start') || L[0];
    if (id === 'p-pause') return L.find((b) => b.id === 'resume') || L[0];
    return L[0];
  }
  function focusEl(el) { if (!el) return; body.classList.add('navmode'); try { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {} }
  function showPanel(id) { for (const k of ['p-start', 'p-opts']) { const p = $(k); if (p) p.hidden = k !== id; } }
  const oo = $('open-opts'), ob = $('opts-back');
  if (oo) oo.addEventListener('click', () => { showPanel('p-opts'); focusEl(items()[0]); });
  if (ob) ob.addEventListener('click', () => { showPanel('p-start'); focusEl(oo); });

  // ---------------- navegação espacial ----------------
  function move(dir) {
    const L = items(); if (!L.length) return;
    const cur = L.includes(doc.activeElement) ? doc.activeElement : null;
    if (!cur) { focusEl(defaultItem(L)); return; }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = 1e9;
    for (const el of L) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const m = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy, o = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (m < 4) continue;
      const s = m + o * 2.5; if (s < bs) { bs = s; best = el; }
    }
    if (!best && (dir === 'up' || dir === 'down')) { // dá a volta: do último pro primeiro item (e vice-versa), ignorando o ícone flutuante
      const M = L.filter((b) => b.id !== 'fs-float'); if (M.length > 1) best = dir === 'down' ? M[0] : M[M.length - 1];
    }
    if (best) focusEl(best);
  }

  // clique do controle e clique nativo do navegador (ex.: Xbox) no mesmo botão contam uma vez só
  let lastEl = null, lastT = 0, lastTrusted = false;
  doc.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('button'), t = now();
    if (el && el === lastEl && t - lastT < 280 && e.isTrusted !== lastTrusted) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    lastEl = el; lastT = t; lastTrusted = e.isTrusted;
  }, true);
  // o clique é adiado um instante para o laço do jogo terminar o quadro atual; depois limpa botões pendentes (ex.: B = "desvirar") para não vazarem pro jogo
  const press = (el) => { if (!el) return; setTimeout(() => { try { if (typeof Input !== 'undefined') Input.edge = {}; } catch (e) {} el.click(); }, 40); };

  function panelBack() {
    const p = activePanel(); if (!p) return;
    if (p.id === 'p-opts') { press(ob); } else if (p.id === 'p-pause') press($('resume'));
  }
  const GARAGE_KEY = { left: 'ArrowLeft', up: 'ArrowLeft', right: 'ArrowRight', down: 'ArrowRight', ok: 'Enter', back: 'Escape' };
  function act(k) {
    if (k === 'fs') { toggleFs(); return; }
    if (garageOpen()) { const c = GARAGE_KEY[k]; if (c) window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true, cancelable: true })); return; }
    if (!menuOn()) return;
    body.classList.add('navmode');
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { move(k); return; }
    if (k === 'back') { panelBack(); return; }
    if (k === 'start') { const s = $('start'); if (mode() === 'menu' && s && !s.disabled) press(s); return; }
    if (k === 'ok') {
      const L = items(), cur = L.includes(doc.activeElement) ? doc.activeElement : null;
      if (cur) { press(cur); return; }
      const d = defaultItem(L); focusEl(d); if (d && (d.id === 'start' || d.id === 'resume')) press(d);
    }
  }

  // ---------------- teclado ----------------
  const KDIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  const setPad = (on) => { if (body.classList.contains('pad-ui') !== on) { body.classList.toggle('pad-ui', on); hintKey = ''; } };
  addEventListener('keydown', (e) => {
    if (!e.isTrusted) return;
    setPad(false);
    const c = e.code;
    if (c === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { toggleFs(); return; }
    if (!menuOn() || garageOpen()) return; // a garagem tem o próprio tratamento de teclas
    if (KDIR[c]) { e.preventDefault(); e.stopImmediatePropagation(); act(KDIR[c]); return; }
    if (c === 'Enter' || c === 'NumpadEnter') {
      e.stopImmediatePropagation(); // impede que o Enter também dispare "pausa" no jogo
      if (!items().includes(doc.activeElement)) { e.preventDefault(); act('ok'); }
      return; // com um botão em foco, o clique nativo do Enter faz o resto
    }
    if (c === 'Escape' && (activePanel() || {}).id === 'p-opts') { e.preventDefault(); e.stopImmediatePropagation(); panelBack(); }
  }, true);
  menu.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    body.classList.remove('navmode'); setPad(false);
    const b = e.target.closest && e.target.closest('button');
    if (b && b !== doc.activeElement && items().includes(b)) b.focus({ preventScroll: true });
  });
  menu.addEventListener('pointerdown', () => body.classList.remove('navmode'));

  // ---------------- controle (gamepad) ----------------
  // evita que cliques/botões "vazem" para o jogo enquanto o menu está aberto
  if (typeof Input !== 'undefined' && Input.take) {
    const take0 = Input.take.bind(Input);
    Input.take = function (n) {
      const m = mode();
      if (m !== 'play') {
        if (n === 'padA' || n === 'cam' || n === 'reset' || n === 'respawn') { this.edge[n] = 0; return false; }
        if (n === 'pause' && m === 'menu') { this.edge.pause = 0; return false; } // no menu inicial só o botão "Começar" inicia
      }
      return take0(n);
    };
  }
  const prev = {}, hold = { dir: null, t: 0, n: 0 };
  function padLoop() {
    requestAnimationFrame(padLoop);
    let g = null; try { const ps = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of ps) if (p && p.connected) { g = p; break; } } catch (e) {}
    const on = menuOn() || garageOpen();
    if (g) {
      const B = (i) => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5));
      const edge = (i) => { const v = B(i), r = v && !prev[i]; prev[i] = v; return r; };
      const a = edge(0), b = edge(1), y = edge(3), lb = edge(4), rb = edge(5), start = edge(9);
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0; let dir = null;
      if (B(12)) dir = 'up'; else if (B(13)) dir = 'down'; else if (B(14)) dir = 'left'; else if (B(15)) dir = 'right';
      else if (Math.hypot(ax, ay) > 0.55) dir = Math.abs(ax) > Math.abs(ay) ? (ax < 0 ? 'left' : 'right') : (ay < 0 ? 'up' : 'down');
      if (a || b || y || start || dir) setPad(true);
      if (on) {
        if (dir !== hold.dir) { hold.dir = dir; hold.t = now(); hold.n = 0; if (dir) act(dir); }
        else if (dir && now() - hold.t > (hold.n === 0 ? 380 : 130)) { hold.t = now(); hold.n++; act(dir); }
        if (a) act('ok'); if (b) act('back'); if (y) act('fs'); if (start) act('start');
        if (garageOpen()) { if (lb) act('left'); if (rb) act('right'); }
      } else hold.dir = null;
    }
    if (on) {
      if ((body.classList.contains('navmode') || body.classList.contains('pad-ui')) && !garageOpen()) { const L = items(); if (L.length && !L.includes(doc.activeElement)) focusEl(defaultItem(L)); }
      renderHints();
    }
  }
  addEventListener('gamepadconnected', () => setPad(true));

  // ---------------- dicas de botões ----------------
  function renderHints() {
    const mh = $('mhints'); if (!mh || !menuOn()) return;
    const p = activePanel(), id = p ? p.id : '', pad = body.classList.contains('pad-ui');
    const back = id === 'p-opts' ? 'Voltar' : id === 'p-pause' ? 'Continuar' : '';
    const key = [pad, id, canFs, isFs()].join('|'); if (key === hintKey) return; hintKey = key;
    const g = (cls, t, label) => '<span><i class="' + cls + '">' + t + '</i>' + label + '</span>';
    const fs = canFs ? (isFs() ? 'Sair da tela cheia' : 'Tela cheia') : '';
    mh.innerHTML = pad
      ? g('', '✛', 'Navegar') + g('a', 'A', 'Selecionar') + (back ? g('b', 'B', back) : '') + (fs ? g('y', 'Y', fs) : '')
      : g('k', '↑↓←→', 'Navegar') + g('k', 'Enter', 'Selecionar') + (back ? g('k', 'Esc', back) : '') + (fs ? g('k', 'F', fs) : '');
  }
  requestAnimationFrame(padLoop);
})();
