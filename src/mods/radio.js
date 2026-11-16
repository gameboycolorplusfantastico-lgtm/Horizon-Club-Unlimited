// ===================== RÁDIO: 4 estações com playlists (assets/radio/radio.json) =====================
// N = próxima estação (… → desligado), B = pular faixa. Gamepad: direcional ← → (estação) / ↑ (pular). Toque: botão RÁDIO.
// Os MP3 ficam em assets/radio/<id>/NN.mp3 (veja LEIA-ME-RADIO.md). Faixa que não existe é pulada sozinha.
const Radio = {
  cfg: null, idx: 0, st: null, queue: [], qi: 0, el: null, ctx: null, lp: null, vol: null, node: null, hist: 0, fails: 0, sinceVig: 0, vigN: 0, busy: false, ts: 0, pad: [0, 0, 0],
  EXT: ['mp3', 'ogg', 'm4a', 'wav'], BASE: 'assets/radio/',
  async init() {
    try { this.cfg = await fetch(this.BASE + 'radio.json').then((r) => { if (!r.ok) throw 0; return r.json(); }); } catch (e) { this.cfg = null; return; }
    try { this.idx = Math.max(0, Math.min(this.cfg.stations.length, +localStorage.getItem('hcu_radio') || 0)); } catch (e) {}
    this.ui = document.getElementById('radio-ui');
    addEventListener('keydown', (e) => { if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; if (e.code === 'KeyN') this.nextStation(1); else if (e.code === 'KeyB') this.skip(); });
    const tb = document.getElementById('b-radio'); if (tb) tb.addEventListener('pointerdown', (e) => { e.preventDefault(); this.nextStation(1); });
    setInterval(() => this.tick(), 250);
  },
  // abre o grafo de áudio (precisa do contexto do jogo, criado ao iniciar)
  ensure() {
    if (this.el) return true; const S = (typeof Sound !== "undefined" ? Sound : null); if (!S || !S.ctx || !S.master) return false;
    this.ctx = S.ctx; const el = this.el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous';
    this.node = this.ctx.createMediaElementSource(el); this.lp = this.ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 22000; this.lp.Q.value = 0.7;
    this.vol = this.ctx.createGain(); this.vol.gain.value = 0.55; this.node.connect(this.lp).connect(this.vol).connect(S.master);
    el.addEventListener('ended', () => this.next()); el.addEventListener('error', () => this.fail());
    el.addEventListener('playing', () => { const c = this.cur; if (!c || c.h !== this.hist || !this.st || c.shown) return; c.shown = true; this.fails = 0; if (!c.vig) { this.show(this.st, c.t.artist + ' — ' + c.t.title); this.sinceVig++; } });
    return true;
  },
  tick() {
    if (!this.cfg) return; const hud = document.getElementById('hud'), playing = hud && !hud.hidden;
    if (this.idx > 0 && !this.st && this.ensure() && playing) this.tune(this.idx, true);
    if (this.lp) this.lp.frequency.setTargetAtTime(playing ? 22000 : 700, this.ctx.currentTime, 0.12); // menu/pausa/garagem: abafa os agudos
    if (this.vol) this.vol.gain.setTargetAtTime(playing ? 0.55 : 0.4, this.ctx.currentTime, 0.2);
    this.pollPad();
  },
  pollPad() {
    let g = null; try { const ps = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of ps) if (p && p.connected) { g = p; break; } } catch (e) {} if (!g) return;
    const b = (i) => (g.buttons[i] && g.buttons[i].pressed ? 1 : 0), now = [b(15), b(14), b(12)];
    if (now[0] && !this.pad[0]) this.nextStation(1); if (now[1] && !this.pad[1]) this.nextStation(-1); if (now[2] && !this.pad[2]) this.skip(); this.pad = now;
  },
  nextStation(d) {
    if (!this.cfg) return; const n = this.cfg.stations.length + 1; this.idx = (this.idx + d + n) % n; try { localStorage.setItem('hcu_radio', this.idx); } catch (e) {}
    if (!this.ensure()) { this.show(this.idx ? this.cfg.stations[this.idx - 1] : null, ''); return; }
    this.tune(this.idx, false);
  },
  shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  tune(i, silent) {
    this.hist++; this.fails = 0; this.sinceVig = 0;
    if (i <= 0) { this.st = null; this.el.pause(); this.show(null, ''); return; }
    this.st = this.cfg.stations[i - 1]; this.queue = this.shuffle(this.st.tracks.map((_, k) => k)); this.qi = -1; this.blip();
    this.show(this.st, 'Sintonizando…'); this.next(true);
  },
  skip() { if (this.st) { this.blip(); this.next(); } },
  next(first) {
    if (!this.st) return; const every = this.cfg.vinhetteEvery || 3;
    if (!first && this.sinceVig >= every && this.vigN < 99) { this.sinceVig = 0; this.playVig(); return; }
    this.qi++; if (this.qi >= this.queue.length) { this.queue = this.shuffle(this.queue); this.qi = 0; }
    this.playTrack(this.st.tracks[this.queue[this.qi]], 0, this.hist);
  },
  src(path, ei, name) { return this.BASE + path + '.' + this.EXT[ei]; },
  playTrack(t, ei, h) {
    if (!this.st) return; this.cur = { t, ei, h, vig: false }; this.el.src = this.src(this.st.id + '/' + t.file, ei);
    this.el.play().catch(() => {});
  },
  // vinheta: arquivo assets/radio/<id>/vinheta-N.mp3 se existir; senão, ruído de sintonia + locutor (voz do navegador)
  playVig() {
    this.vigN++; this.cur = { vig: true, ei: 0, h: this.hist, k: (this.vigN % 3) + 1 };
    this.el.src = this.src(this.st.id + '/vinheta-' + this.cur.k, 0); this.el.play().catch(() => {});
  },
  fail() {
    const c = this.cur; if (!c || c.h !== this.hist || !this.st) return;
    if (c.ei < this.EXT.length - 1) { c.ei++; this.el.src = this.src(this.st.id + '/' + (c.vig ? 'vinheta-' + c.k : c.t.file), c.ei); this.el.play().catch(() => {}); return; }
    if (c.vig) { this.synthVig(); this.next(); return; } // sem arquivo de vinheta: usa a sintética e segue
    if (++this.fails >= 4) { this.show(this.st, 'Sem faixas — coloque os MP3 em assets/radio/' + this.st.id + '/'); this.el.removeAttribute('src'); return; }
    this.next();
  },
  blip() { // chiado curto de sintonia
    try { const c = this.ctx, n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * 0.35, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(600, c.currentTime); f.frequency.exponentialRampToValueAtTime(3500, c.currentTime + 0.3); const g = c.createGain(); g.gain.value = 0.12; n.connect(f).connect(g).connect((typeof Sound !== "undefined" ? Sound : null).master); n.start(); } catch (e) {}
  },
  synthVig() {
    this.blip(); try { if (window.speechSynthesis && this.st) { const u = new SpeechSynthesisUtterance(this.st.freq.replace('.', ' ponto ') + ' ' + this.st.name.toLowerCase() + '. ' + this.st.slogan); u.lang = 'en-US'; u.volume = 0.7; u.rate = 1.05; speechSynthesis.speak(u); } } catch (e) {}
  },
  show(st, line) {
    const u = this.ui; if (!u) return; u.style.setProperty('--rc', st ? st.color : '#888');
    u.innerHTML = st ? '<small>' + st.freq + '</small><b>' + st.name + '</b><span>' + (line || st.slogan) + '</span>' : '<b>RÁDIO DESLIGADO</b><span>N: ligar estações</span>';
    u.classList.add('on'); clearTimeout(this.hide); this.hide = setTimeout(() => u.classList.remove('on'), st ? 4800 : 2200);
  },
};
Radio.init();
