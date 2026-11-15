// ===================== ÁUDIO sintetizado (WebAudio) =====================
// Motor: usa o Engine_Sim (assets/engine-sim/, baixado pelo Action "Atualizar audio de motor").
// Se a pasta nao existir ou falhar, cai sozinho no motor antigo (3 osciladores) abaixo.
const ENGINE_BY_CYL = { 1: 'vtwin', 2: 'vtwin', 3: 'i3', 4: 'i4', 5: 'i5', 6: 'i6', 8: 'v8cross', 10: 'v10', 12: 'v12' };
// Escolhe o id do motor do Engine_Sim a partir dos dados do carro (cars.json):
// 1) campo "engine" (manual, ex.: "v8flat")  2) texto de "specs" (V8, V6, boxer, turbo, diesel, rotativo)  3) "cyl"
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
// chassi do Engine_Sim a partir da classe do carro: muda marcha lenta, whine do cambio e tipo de troca
function pickVehicle(car) {
  const c = String(car.cls || '').toLowerCase();
  if (/pickup|picape|caminhon|truck|suv|4x4/.test(c)) return 'truck';
  if (/super|hiper/.test(c)) return 'supercar';
  if (/muscle/.test(c)) return 'muscle';
  if (/hatch|compacto|popular/.test(c)) return 'hatch';
  return 'sports';
}
const Sound = {
  ctx: null, on: true, ok: false, sim: null, simReady: false, simLoading: false, simOff: false, curCar: null, wantCar: null, lastT: 0, ENGINE_PATH: './assets/engine-sim/engine-sim.js',
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.5 : 0; this.master.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.connect(this.master); this.bus = comp;
      // motor: 3 osciladores + filtro
      this.eng = c.createGain(); this.eng.gain.value = 0; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.2; this.lp.frequency.value = 600;
      this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square'; this.o3 = c.createOscillator(); this.o3.type = 'sawtooth';
      const g1 = c.createGain(), g2 = c.createGain(), g3 = c.createGain(); g1.gain.value = 0.5; g2.gain.value = 0.22; g3.gain.value = 0.3;
      this.o1.connect(g1).connect(this.lp); this.o2.connect(g2).connect(this.lp); this.o3.connect(g3).connect(this.lp); this.lp.connect(this.eng).connect(this.bus);
      this.o1.start(); this.o2.start(); this.o3.start();
      // ruído
      const len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = nb;
      const mkNoise = (type, f, q) => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl).connect(g).connect(this.bus); s.start(); return { g, fl }; };
      this.tire = mkNoise('bandpass', 1500, 3); this.wind = mkNoise('lowpass', 500, 0.5); this.road = mkNoise('lowpass', 180, 0.7);
      this.simOut = c.createGain(); this.simOut.gain.value = 1; this.simOut.connect(this.bus);
      this.ok = true;
    } catch (e) { this.ok = false; }
    if (this.ok) this.loadSim();
  },
  // carrega o Engine_Sim sob demanda (import dinamico funciona dentro do index.html inline)
  async loadSim() {
    if (this.simLoading || this.simReady || this.simOff) return; this.simLoading = true;
    try {
      const mod = await import(this.ENGINE_PATH); this.ES = mod.EngineSim;
      this.ids = new Set(this.ES.engines().map((e) => e.id));
      try { const reg = await fetch('assets/cars/cars.json').then((r) => r.json()); this.carTable = {}; for (const k of reg.cars || []) this.carTable[k.id] = { specs: k.specs, cls: k.class, engine: k.engine, cyl: k.cyl }; } catch (e) {}
      const car = this.info(this.wantCar || { cyl: 6 });
      this.sim = new this.ES(this.ctx, { engine: pickEngine(car, this.ids), vehicle: pickVehicle(car), destination: this.simOut });
      await this.sim.start(); this.curCar = (this.wantCar && this.wantCar.carId) || null; this.simReady = true; this.lastT = performance.now();
    } catch (e) { console.warn('Engine_Sim indisponivel, usando motor simples:', e); this.simOff = true; this.sim = null; this.simReady = false; }
    this.simLoading = false;
  },
  // junta os dados do veiculo com a linha dele em cars.json (specs, class, engine, cyl)
  info(car) { return Object.assign({ cyl: car.cyl }, (this.carTable && this.carTable[car.carId]) || {}); },
  // troca o motor quando o jogador troca de carro (hot-swap, sem recriar o grafo de audio)
  setCar(car) {
    this.wantCar = car; if (!this.simReady) return; const inf = this.info(car);
    try { this.sim.setEngineType(pickEngine(inf, this.ids)); this.sim.setVehicle(pickVehicle(inf)); this.curCar = car.carId || null; } catch (e) { console.warn(e); this.simFail(e); }
  },
  simFail(e) { this.simOff = true; this.simReady = false; try { this.sim && this.sim.dispose(); } catch (x) {} this.sim = null; },
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.05); },
  update(car, paused) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    // f0 = frequência das explosões do motor = cilindros / 2 por volta
    if (car.carId && car.carId !== this.curCar) this.setCar(car);
    let useSim = false;
    if (this.simReady && !this.simOff) {
      try {
        const now = performance.now(), dt = Math.min(0.05, Math.max(0.001, (now - this.lastT) / 1000)); this.lastT = now;
        this.simOut.gain.setTargetAtTime(paused ? 0 : 1, t, 0.05);
        this.sim.setThrottle(paused ? 0 : car.throttle || 0); this.sim.setBrake(paused ? 0 : Math.max(0, car.brake || 0));
        this.sim.update(dt); useSim = true;
        this.ev = this.sim.getEvents ? this.sim.getEvents() : null; // lash/pop/bov/shiftDone: ligue em camera/rumble se quiser
      } catch (e) { console.warn(e); this.simFail(e); }
    }
    const rpm = car.rpm, thr = car.throttle, f0 = rpm / 60 * (car.cyl || 6) / 2; const load = 0.35 + 0.65 * thr;
    this.o1.frequency.setTargetAtTime(f0, t, 0.03); this.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03); this.o3.frequency.setTargetAtTime(f0 * 2.01, t, 0.03);
    this.lp.frequency.setTargetAtTime(350 + rpm * 0.55 + thr * 700, t, 0.05);
    this.eng.gain.setTargetAtTime(paused || useSim ? 0 : (0.16 + 0.22 * load) * (0.5 + rpm / 16000), t, 0.05);
    const sk = Math.max(car.skidAmt, 0); this.tire.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.4, sk * 0.5), t, 0.05); this.tire.fl.frequency.setTargetAtTime(900 + car.speed * 14, t, 0.1);
    this.wind.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.35, Math.pow(car.speed / 70, 1.6) * 0.4), t, 0.1); this.wind.fl.frequency.setTargetAtTime(300 + car.speed * 8, t, 0.1);
    this.road.g.gain.setTargetAtTime(paused ? 0 : Math.min(0.25, car.speed / 80 * 0.25) * (car.onGround ? 1 : 0), t, 0.1);
  },
  crash(power) {
    if (!this.ok || !this.on) return; const c = this.ctx, t = c.currentTime; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + power * 60; const g = c.createGain();
    const a = Math.min(1, power / 18); g.gain.setValueAtTime(a * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); s.connect(f).connect(g).connect(this.bus); s.start(t, Math.random()); s.stop(t + 0.6);
    const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35); const g2 = c.createGain(); g2.gain.setValueAtTime(a * 0.8, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.connect(g2).connect(this.bus); o.start(t); o.stop(t + 0.45);
  },
};
