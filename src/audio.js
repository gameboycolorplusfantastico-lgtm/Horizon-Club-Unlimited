// ===================== ÁUDIO sintetizado (WebAudio) =====================
const Sound = {
  ctx: null, on: true, ok: false,
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
      this.ok = true;
    } catch (e) { this.ok = false; }
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.setTargetAtTime(v ? 0.5 : 0, this.ctx.currentTime, 0.05); },
  update(car, paused) {
    if (!this.ok) return; const c = this.ctx, t = c.currentTime;
    // f0 = frequência das explosões do motor = cilindros / 2 por volta
    const rpm = car.rpm, thr = car.throttle, f0 = rpm / 60 * (car.cyl || 6) / 2; const load = 0.35 + 0.65 * thr;
    this.o1.frequency.setTargetAtTime(f0, t, 0.03); this.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03); this.o3.frequency.setTargetAtTime(f0 * 2.01, t, 0.03);
    this.lp.frequency.setTargetAtTime(350 + rpm * 0.55 + thr * 700, t, 0.05);
    this.eng.gain.setTargetAtTime(paused ? 0 : (0.16 + 0.22 * load) * (0.5 + rpm / 16000), t, 0.05);
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
