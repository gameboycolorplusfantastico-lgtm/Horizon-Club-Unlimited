// Menu de pausa em abas (estilo Forza Horizon 2). O foco/controle/teclado dos botoes vem de menu_pro.js (o painel e o #p-pause);
// aqui ficam: troca de abas (clique/toque, Q/E, LB/RB) e os dados do carro atual.
(() => {
  const $ = (id) => document.getElementById(id), pz = $('p-pause'); if (!pz) return;
  const TABS = ['pausa', 'carro', 'opcoes', 'controles'], SUSP = { sport: 'Esportiva', super: 'Superesportiva', muscle: 'Muscle car', gt: 'Grand Tourer', rally: 'Rally', suv: 'SUV', offroad: 'Off-road' };
  let cur = 'pausa';
  const open = () => !pz.hidden;
  function setTab(name, focus) {
    if (!TABS.includes(name)) return; cur = name;
    for (const b of pz.querySelectorAll('.pz-tab')) { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
    for (const s of pz.querySelectorAll('.pz-pane')) s.hidden = s.dataset.pane !== name;
    if (name === 'carro') fillCar();
    if (focus) { const t = pz.querySelector('.pz-tab.on'); if (t) try { t.focus({ preventScroll: true }); } catch (e) {} }
  }
  function fillCar() {
    const i = typeof window.__carInfo === 'function' ? window.__carInfo() : null, box = $('pz-carinfo'); if (!box || !i) return;
    const st = (k, v) => '<div class="pz-stat"><small>' + k + '</small><b>' + v + '</b></div>', len = i.scale ? (4.49 * i.scale).toFixed(2).replace('.', ',') + ' m' : '—';
    box.innerHTML = st('Carro', i.name || '—') + (i.brand ? st('Marca', i.brand) : '') + (i.specs ? st('Motor', i.specs) : '') + st('Suspensão', SUSP[i.susp] || 'Padrão') + st('Tração', i.awd ? 'Integral' : 'Simples') + st('Massa', (i.mass || 1500) + ' kg') + st('Comprimento no jogo', len);
  }
  function header() { const i = typeof window.__carInfo === 'function' ? window.__carInfo() : null, el = $('pz-car'); if (el) el.innerHTML = i ? '<span>' + (i.brand || '') + '</span><b>' + (i.name || '') + '</b>' : ''; }
  const fsb = $('fs-btn'); if (fsb) fsb.addEventListener('click', () => { const f = $('fs-float'); if (f) f.click(); });
  pz.addEventListener('click', (e) => { const t = e.target.closest('.pz-tab'); if (t) setTab(t.dataset.tab); });
  const step = (d) => setTab(TABS[(TABS.indexOf(cur) + d + TABS.length) % TABS.length], true);
  addEventListener('keydown', (e) => { if (!open() || !e.isTrusted || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; if (e.code === 'KeyQ') { e.stopImmediatePropagation(); step(-1); } else if (e.code === 'KeyE') { e.stopImmediatePropagation(); step(1); } }, true);
  const prev = {}; (function loop() { requestAnimationFrame(loop); let g = null; try { for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected) { g = p; break; } } catch (e) {} if (!g) return;
    const edge = (i) => { const v = !!(g.buttons[i] && g.buttons[i].pressed), r = v && !prev[i]; prev[i] = v; return r; }; const lb = edge(4), rb = edge(5); if (open()) { if (lb) step(-1); if (rb) step(1); } })();
  new MutationObserver(() => { if (open()) { header(); setTab('pausa'); } }).observe(pz, { attributes: true, attributeFilter: ['hidden'] });
})();
