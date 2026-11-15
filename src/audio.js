// ===================== ÁUDIO (WebAudio) =====================
// Ordem de prioridade do motor: 1) gravacoes reais (assets/audio/engine/*.json)  2) Engine_Sim (assets/engine-sim/, sintetizado,
// com o giro guiado pelo proprio jogo)  3) motor simples (osciladores). Efeitos (batida, freio de mao, cascalho, agua) usam os WAV de assets/audio/.
function audioBadge(txt, good) {
  if (typeof document === 'undefined') return;
  try {
    const d = document.createElement('div'); d.textContent = txt;
    d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:90vw;padding:6px 10px;border-radius:8px;font:12px/1.3 sans-serif;color:#fff;pointer-events:none;background:' + (good ? 'rgba(20,120,50,.9)' : 'rgba(170,40,40,.92)');
    document.body.appendChild(d); setTimeout(() => d.remove(), good ? 7000 : 20000);
  } catch (e) {}
}
const ENGINE_BY_CYL = { 1: 'vtwin', 2: 'vtwin', 3: 'i3', 4: 'i4', 5: 'i5', 6: 'i6', 8: 'v8cross', 10: 'v10', 12: 'v12' };
// Escolhe o motor do Engine_Sim a partir dos dados do carro (cars.json): campo "engine" > texto de "specs" > "cyl"
function pickEngine(car, ids) {
  const ok = (id) => (!ids || ids.has(id)) ? id : null;
  if (car.engine && ok(car.engine)) return car.engine;
  const s = String(car.specs || '').toLowerCase();
  const turbo = /turbo|biturbo|twin-?turbo|\btt\b/.test(s), diesel = /diesel/.test(s);
  const m = s.match(/\bv\s?(\d{1,2})\b/), fl = s.match(/(?:boxer|flat|plano)\D{0,3}(\d)/), cil = s.match(/(\d{1,2})\s*cil/);
  let id = null;
  if (/rotativ|wankel|rotary/.test(s)) id = 'rotary2';
  else if (fl) id = +fl[1] === 4 ? 'boxer4' : +fl[1] === 6 ? 'flat6' : null;
  else if (m) { const n = +m[1]; id = n === 6 ? (turbo ? 'v6tt' : 'v6') : n === 8 ? (/flat|plano/.test(s) ? 'v8flat' : turbo ? 'v8tt' : 'v8cross') : ENGINE_BY_CYL[n]; }
  else { const n = cil ? +cil[1] : (car.cyl || 6); id = n === 6 && diesel ? 'i6diesel' : ENGINE_BY_CYL[n]; }
  return ok(id) || ok(ENGINE_BY_CYL[car.cyl || 6]) || ok('i6');
}
function pickVehicle(car) {
  const c = String(car.cls || car.class || '').toLowerCase();
  if (/pickup|picape|caminhon|truck|suv|4x4/.test(c)) return 'truck';
  if (/super|hiper/.test(c)) return 'supercar';
  if (/muscle/.test(c)) return 'muscle';
  if (/hatch|compacto|popular/.test(c)) return 'hatch';
  return 'sports';
}
// Faz o Engine_Sim seguir o giro/aceleracao/velocidade do JOGO (e nao a fisica propria dele):
// depois de cada passo da fisica interna, sobrescreve os parametros que alimentam o som.
function attachHostDrive(sim, host) {
  const phys = sim.physics, orig = phys.step.bind(phys), st = { load: 0, over: 0, prev: null };
  phys.step = (dt, now) => {
    const p = orig(dt, now); if (!host.on || !(dt > 0)) return p;
    const prof = sim.profile, idle = prof.idleRpm, red = prof.redlineRpm, rpm = idle + host.norm * (red - idle);
    if (st.prev == null) st.prev = rpm; p.dRpm = Math.max(-30000, Math.min(30000, (rpm - st.prev) / dt)); st.prev = rpm;
    p.rpm = rpm; p.f0 = rpm / 120; p.rpmNorm = host.norm; p.throttle = host.thr;
    st.load += (host.thr - st.load) * Math.min(1, 9 * dt); p.load = st.load;
    const coast = host.thr < 0.04 && host.speed > 2 && host.norm > 0.2 ? 1 : 0; st.over += (coast - st.over) * Math.min(1, 6 * dt); p.overrun = st.over;
    p.torqueSign = host.thr > 0.04 ? 1 : -1;
    const fd = (sim.geared && sim.geared.finalDrive) || 3.5;
    p.speed = host.speed; p.wheelRpm = host.speed / (host.wr || 0.35) * fd * 9.5493; p.gearRatio = p.wheelRpm > 20 ? Math.min(30, rpm * fd / p.wheelRpm) : 0;
    p.gear = host.gear > 0 ? host.gear : 0; p.clutchEngaged = host.shifting ? 0 : 1; p.clutchSlip = 0;
    p.shifting = !!host.shifting; p.shiftPhase = host.shifting ? (host.cut ? 'cut' : 'sync') : '';
    p.evCut = host.evCut || 0; p.evLash = host.evLash || 0; p.evEngage = 0; p.evBov = host.evBov || 0; p.evShiftDone = host.evDone || 0;
    host.evCut = host.evLash = host.evBov = host.evDone = 0;
    return p;
  };
}
const Sound = {
  ctx: null, on: true, ok: false, smp: {}, bank: null, bankFor: null, bankLoading: false, carId: null, prevHb: 0, wasWater: false, lastHit: 0,
  DIR: 'assets/audio/', ENGINE_PATH: './assets/engine-sim/engine-sim.js', sim: null, simReady: false, simLoading: false, simOff: false, host: { on: false, norm: 0, thr: 0, speed: 0, gear: 1, wr: 0.35, shifting: false, cut: false }, lastT: 0, prevShift: 0, prevCut: 0, prevThr: 0, carTable: null, wantCar: null, simCar: null,
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.5 : 0; this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.connect(this.master); this.bus = comp;
      // motor: 3 osciladores + filtro
      this.eng = c.createGain(); this.eng.gain.value = 0; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.2; this.lp.frequency.value = 600;
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'triangle'; this.o3 = c.createOscillator(); this.o3.type = 'sawtooth';
      const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.22; g3.gain.value = 0.3;
      const sh = c.createWaveShaper(), cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) cv[i] = Math.tanh(2.4 * (i / 512 - 1)); sh.curve = cv; this.lp.connect(sh); this.o1.connect(g1).connect(this.lp); this.o2.connect(g2).connect(this.lp); this.o3.connect(g3).connect(this.lp); sh.connect(this.eng).connect(this.bus);
      this.o1.start(); this.o2.start(); this.o3.start();
      // ruído
      const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
      const mkNoise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(this.bus); s.start(); return { g, fl }; };
      this.tire = mkNoise('bandpass', 1500, 3); this.wind = mkNoise('lowpass', 500, 0.5); this.road = mkNoise('lowpass', 180, 0.7);
      this.engBank = c.createGain(); this.engBank.gain.value = 0; this.engBank.connect(this.bus);
      this.gravel = { g: c.createGain(), src: null }; this.gravel.g.gain.value = 0; this.gravel.g.connect(this.bus);
      this.ok = true;
    } catch (e) { this.ok = false; }
    if (this.ok) { this.simOut = this.ctx.createGain(); this.simOut.gain.value = 1; this.simOut.connect(this.bus); this.loadSamples(); this.loadSim(); }
  },
  info(car) { return Object.assign({ cyl: car.cyl }, (this.carTable && this.carTable[car.carId]) || {}); },
  async loadSim() {
    if (this.simLoading || this.simReady || this.simOff) return; this.simLoading = true;
    try {
      try { const reg = await fetch('assets/cars/cars.json').then((r) => r.json()); this.carTable = {}; for (const k of reg.cars || []) this.carTable[k.id] = { specs: k.specs, cls: k.class, engine: k.engine, cyl: k.cyl }; } catch (e) {}
      const mod = await import(this.ENGINE_PATH); this.ES = mod.EngineSim; this.ids = new Set(this.ES.engines().map((e) => e.id));
      const car = this.info(this.wantCar || { cyl: 6 }), id = pickEngine(car, this.ids);
      this.sim = new this.ES(this.ctx, { engine: id, vehicle: pickVehicle(car), destination: this.simOut });
      attachHostDrive(this.sim, this.host);
      await this.sim.start(); this.simCar = (this.wantCar && this.wantCar.carId) || null; this.simReady = true; this.lastT = performance.now();
      console.info('[Engine_Sim] ativo:', id); audioBadge('Áudio: Engine_Sim ativo (' + id + ')', true);
    } catch (e) {
      console.warn('[Engine_Sim] indisponivel:', e); this.simOff = true; this.sim = null; this.simReady = false;
      audioBadge('Áudio: motor SIMPLES (Engine_Sim falhou: ' + String((e && (e.message || e)) || '?').slice(0, 140) + ')', false);
    }
    this.simLoading = false;
  },
  setSimCar(car) {
    this.wantCar = car; if (!this.simReady) return; const inf = this.info(car);
    try { this.sim.setEngineType(pickEngine(inf, this.ids)); this.sim.setVehicle(pickVehicle(inf)); this.simCar = car.carId || null; console.info('[Engine_Sim] motor:', pickEngine(inf, this.ids)); }
    catch (e) { console.warn(e); this.simOff = true; this.simReady = false; }
  },
  decode(url) {
    return fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); })
      .then((b) => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej)));
  },
  // efeitos reais (assets/audio/*.wav): batida, freio de mao, cascalho (loop), motor morrendo
  async loadSamples() {
    for (const k of ['collision-heavy', 'handbrake', 'engine-stall', 'gravel-loop']) {
      try { this.smp[k] = await this.decode(this.DIR + k + '.wav'); } catch (e) { console.warn('[som] falhou', k, e && e.message); }
    }
    const b = this.smp['gravel-loop'];
    if (b && !this.gravel.src) { const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(this.gravel.g); s.start(); this.gravel.src = s; }
  },
  play(name, vol, rate) {
    const b = this.smp[name]; if (!b || !this.ok || !this.on) return false;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol == null ? 1 : vol;
    s.connect(g).connect(this.bus); s.start(); return true;
  },
  // ---- motor por gravacoes (estilo jogos de corrida): clipes em varias rotacoes, com crossfade entre os dois vizinhos ----
  // assets/audio/engine/<id-do-carro>.json  ou  default.json  ->  { "clips": [ { "file": "idle.ogg", "rpm": 900 }, ... ] }
  dropBank() { if (!this.bank) return; for (const k of this.bank.clips) { try { k.src.stop(); k.src.disconnect(); k.g.disconnect(); } catch (e) {} } this.bank = null; },
  async loadBank(id) {
    if (this.bankLoading || !this.ok) return; this.bankLoading = true;
    try {
      let man = null, base = '';
      for (const u of [this.DIR + 'engine/' + id + '.json', this.DIR + 'engine/default.json']) {
        try { const r = await fetch(u); if (r.ok) { man = await r.json(); base = u.replace(/[^/]*$/, ''); break; } } catch (e) {}
      }
      if (!man || !man.clips || !man.clips.length) { this.dropBank(); }
      else {
        const clips = [];
        for (const k of man.clips.slice().sort((a, b) => a.rpm - b.rpm)) {
          const buf = await this.decode(base + k.file), s = this.ctx.createBufferSource(), g = this.ctx.createGain();
          s.buffer = buf; s.loop = true; g.gain.value = 0; s.connect(g).connect(this.engBank); s.start(); clips.push({ rpm: k.rpm, src: s, g });
        }
        this.dropBank(); this.bank = { clips, gain: man.gain || 1 };
      }
    } catch (e) { console.warn('[som] motor por gravacoes falhou, usando motor simples:', e && e.message); this.dropBank(); }
    this.bankFor = id; this.bankLoading = false;
    if (this.carId && this.carId !== this.bankFor) this.loadBank(this.carId);
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.05); },
  update(car, paused) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    // f0 = frequência das explosões do motor = cilindros / 2 por volta
    if (car.carId && car.carId !== this.carId) { this.carId = car.carId; if (this.bankFor !== this.carId) this.loadBank(this.carId); }
    const hasBank = !!this.bank; let useSim = false;
    if (car.carId && car.carId !== this.simCar) this.setSimCar(car);
    if (this.simReady && !this.simOff && !hasBank) {
      try {
        const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - this.lastT) / 1000)); this.lastT = now;
        const P = car.P || {}, idle = P.idle || 950, rmax = P.rpmMax || 8200, h = this.host, shifting = (car.shiftT || 0) > 0, cut = (car.shiftCut || 0) > 0, thr = paused ? 0 : (car.throttle || 0);
        h.on = true; h.norm = Math.min(1, Math.max(0, ((car.rpm || idle) - idle) / (rmax - idle))); h.thr = thr; h.speed = Math.abs(car.speed || 0); h.gear = car.gear || 0; h.wr = P.wr || 0.35; h.shifting = shifting; h.cut = cut;
        if (cut && !this.prevCut) h.evCut = 0.8; if (this.prevShift && !shifting) { h.evLash = 0.5; h.evDone = 1; } if (this.prevThr > 0.6 && thr < 0.15) h.evBov = 0.7;
        this.prevCut = cut; this.prevShift = shifting; this.prevThr = thr;
        this.simOut.gain.setTargetAtTime(paused ? 0 : 1, t, 0.05);
        this.sim.setThrottle(thr); this.sim.setBrake(paused ? 0 : Math.max(0, car.brake || 0)); this.sim.update(dt); useSim = true;
      } catch (e) { console.warn(e); this.simOff = true; this.simReady = false; try { this.sim.dispose(); } catch (x) {} }
    } else if (this.simReady && hasBank) this.simOut.gain.setTargetAtTime(0, t, 0.05);
    if (hasBank) {
      const cl = this.bank.clips, r = car.rpm || 900, n = cl.length; let i = 0; while (i < n - 1 && r > cl[i + 1].rpm) i++;
      const a = cl[i], b = cl[Math.min(i + 1, n - 1)], f = b.rpm > a.rpm ? Math.min(1, Math.max(0, (r - a.rpm) / (b.rpm - a.rpm))) : 0;
      for (let k = 0; k < n; k++) {
        let gv = n === 1 ? 1 : k === i ? Math.cos(f * Math.PI / 2) : k === i + 1 ? Math.sin(f * Math.PI / 2) : 0; // potencia constante: cos^2 + sin^2 = 1
        cl[k].g.gain.setTargetAtTime(gv, t, 0.03); cl[k].src.playbackRate.setTargetAtTime(Math.min(2, Math.max(0.5, r / cl[k].rpm)), t, 0.03);
      }
      this.engBank.gain.setTargetAtTime(paused ? 0 : this.bank.gain * (0.5 + 0.5 * (car.throttle || 0)), t, 0.06);
    }
    // freio de mao (borda de subida) e motor morrendo na agua
    const hb = car.hb || 0; if (!paused && hb > 0.5 && this.prevHb <= 0.5 && (car.speed || 0) > 3) this.play('handbrake', Math.min(1, 0.4 + (car.speed || 0) / 30), 0.95 + Math.random() * 0.1); this.prevHb = hb;
    const wet = (car.inWater || 0) > 1.0; if (!paused && wet && !this.wasWater) this.play('engine-stall', 0.9, 1); this.wasWater = wet;
    // cascalho: rodas na grama/terra
    let off = 0; if (car.wheels && !paused) { for (const w of car.wheels) if (w.ground && w.surf >= 2) off += w.surf === 3 ? 1 : 0.6; off /= 4; }
    this.gravel.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.7, off * Math.min(1, (car.speed || 0) / 14) * 0.8), t, 0.1);
    if (this.gravel.src) this.gravel.src.playbackRate.setTargetAtTime(0.8 + Math.min(1, (car.speed || 0) / 40) * 0.5, t, 0.2);
    const rpm = car.rpm, thr = car.throttle, f0 = rpm / 60 * (car.cyl || 6) / 2; const load = 0.35 + 0.65 * thr;
    this.o1.frequency.setTargetAtTime(f0, t, 0.03); this.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03); this.o3.frequency.setTargetAtTime(f0 * 2.01, t, 0.03);
    this.lp.frequency.setTargetAtTime(260 + rpm * 0.38 + thr * 500, t, 0.05);
    this.eng.gain.setTargetAtTime(paused || hasBank || useSim ? 0 : (0.16 + 0.22 * load) * (0.5 + rpm / 16000), t, 0.05);
    const sk = Math.max(car.skidAmt, 0); this.tire.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.4, sk * 0.5), t, 0.05); this.tire.fl.frequency.setTargetAtTime(900 + car.speed * 14, t, 0.1);
    this.wind.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.35, Math.pow(car.speed / 70, 1.6) * 0.4), t, 0.1); this.wind.fl.frequency.setTargetAtTime(300 + car.speed * 8, t, 0.1);
    this.road.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.25, car.speed / 80 * 0.25) * (car.onGround ? 1 : 0), t, 0.1);
  },
  crash(power) {
    if (!this.ok || !this.on) return;
    const nowMs = performance.now(); if (nowMs - this.lastHit < 120) return; this.lastHit = nowMs;
    if (this.play('collision-heavy', 0.3 + 0.7 * Math.min(1, power / 18), 1.15 - Math.min(0.35, power / 60) + Math.random() * 0.08)) return; const c = this.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + power * 60; const g = c.createGain();
    const a = Math.min(1, power / 18); g.gain.setValueAtTime(a * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); s.connect(f).connect(g).connect(this.bus); s.start(t, Math.random()); s.stop(t + 0.6);
    const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35); const g2 = c.createGain(); g2.gain.setValueAtTime(a * 0.8, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.connect(g2).connect(this.bus); o.start(t); o.stop(t + 0.45);
  },
};
