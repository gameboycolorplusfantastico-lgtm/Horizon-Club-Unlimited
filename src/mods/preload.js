// ===================== DOWNLOAD DE TODOS OS ARQUIVOS (tela de carregamento) =====================
// - assets/manifest.json (gerado por tools/build.py) lista tudo, menos as músicas do rádio (tocam sob demanda).
// - Tudo que é baixado fica no Cache Storage do navegador: da segunda vez o carregamento é instantâneo, mesmo sem internet.
// - fetch() de qualquer arquivo de assets/ passa primeiro pelo cache (inclusive carros, capas, NPCs, tráfego).
// - Quando o manifest muda (nova atualização do jogo) o cache antigo é apagado sozinho.
const Preload = (() => {
  const NAME = 'hcu-assets', LSK = 'hcu-assets-ver';
  const okCache = typeof caches !== 'undefined';
  const orig = window.fetch.bind(window);
  let man = null, running = null, skipRes = null;
  const state = { total: 1, done: 0, files: 0, nDone: 0, label: '', stage: 'idle', ess: false, fail: 0 };
  function rel(u) {
    try {
      const s = typeof u === 'string' ? u : (u && u.url); if (!s) return null;
      const a = new URL(s, location.href); if (a.origin !== location.origin) return null;
      const i = a.pathname.indexOf('/assets/'); if (i < 0) return null; const p = a.pathname.slice(i + 1);
      return /^assets\/(radio\/|manifest\.json)/.test(p) ? null : p;
    } catch (e) { return null; }
  }
  window.fetch = function (u, o) {
    const p = rel(u); if (!p || !okCache || (o && ((o.method && o.method !== 'GET') || o.headers))) return orig(u, o);
    return caches.open(NAME).then((c) => c.match(p).then((h) => h || orig(u, o).then((r) => { if (r.ok && r.status === 200) c.put(p, r.clone()).catch(() => {}); return r; }))).catch(() => orig(u, o));
  };
  async function init() {
    try {
      const r = await orig('assets/manifest.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw 0; man = await r.json();
      let old = null; try { old = localStorage.getItem(LSK); } catch (e) {}
      if (okCache && old !== man.v) { await caches.delete(NAME); try { localStorage.setItem(LSK, man.v); } catch (e) {} }
    } catch (e) { man = null; }
    return !!man;
  }
  // ordem: essenciais (mapa, props, tráfego, NPCs, som, mapa grande, carro atual) -> capas -> demais carros
  function prio(p, carDir) {
    if (/^assets\/(city|props|traffic)\./.test(p) || /^assets\/(npc\/|tex\/|audio\/|engine-sim\/|logo|map_|minimap|cars\/cars\.json)/.test(p)) return 0;
    if (carDir && p.indexOf('assets/cars/' + carDir + '/') === 0) return 0;
    if (/thumb\.png$/.test(p)) return 1;
    return 2;
  }
  async function one(c, p) {
    for (let t = 0; t < 3; t++) {
      try {
        if (await c.match(p)) return;
        const r = await orig(p); if (!r.ok) throw new Error(r.status);
        const buf = await r.arrayBuffer(); await c.put(p, new Response(buf, { status: 200, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } })); return;
      } catch (e) { if (t === 2) throw e; await new Promise((z) => setTimeout(z, 400 * (t + 1))); }
    }
  }
  // baixa tudo. onProgress(state) a cada arquivo; resolve quando termina (ou quando o jogador pula depois dos essenciais)
  function run(onProgress, carDir) {
    if (running) return running;
    running = (async () => {
      if (!man || !okCache) { state.stage = 'done'; state.ess = true; onProgress && onProgress(state); return; }
      const c = await caches.open(NAME);
      const list = man.files.map((f) => ({ p: f[0], b: f[1], k: prio(f[0], carDir) })).sort((a, b) => a.k - b.k);
      state.total = list.reduce((s, f) => s + f.b, 0) || 1; state.files = list.length; state.stage = 'run';
      const essTotal = list.filter((f) => f.k === 0).length; let essDone = 0, i = 0;
      const next = async () => {
        while (i < list.length) {
          const f = list[i++]; state.label = f.p.replace(/^assets\//, '');
          try { await one(c, f.p); } catch (e) { state.fail++; }
          state.done += f.b; state.nDone++; if (f.k === 0 && ++essDone >= essTotal) state.ess = true;
          onProgress && onProgress(state);
        }
      };
      const all = Promise.all(Array.from({ length: 6 }, next)).then(() => { state.ess = true; state.stage = 'done'; onProgress && onProgress(state); });
      await Promise.race([all, new Promise((res) => { skipRes = res; })]); // "Pular" libera o jogo; o resto segue baixando em segundo plano
    })();
    return running;
  }
  // "Pular": continua o jogo e deixa o resto baixando em segundo plano
  function skip() { if (skipRes && state.ess) { skipRes(); return true; } return false; }
  return { init, run, skip, state, get manifest() { return man; } };
})();
