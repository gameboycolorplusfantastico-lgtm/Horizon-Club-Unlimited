// ===================== JOGO: carga, HUD, câmera, laço principal =====================
(function () {
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const isTouch = (matchMedia && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;
  const cfg = { quality: 'auto', units: 'kmh', sound: true, camStyle: 'mlc', fx: 'on', mirror: 'on', trans: 'auto', paint: {} };
  const KEY = 'horizon-club-unlimited'; // (migra as configurações do nome antigo, 'asfalto-livre')
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('asfalto-livre') || '{}')); } catch (e) {}
  if (qs.get('q')) cfg.quality = qs.get('q');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };
  const QUAL = { low: { scale: 0.62, dist: 420, aniso: 1, tex: 0.5, ao: false, dpr: 1 }, med: { scale: 0.85, dist: 760, aniso: 4, tex: 1, ao: true, dpr: 1.5 }, high: { scale: 1, dist: 1250, aniso: 8, tex: 1, ao: true, dpr: 2 } };
  const canvas = $('c'); let R, world, veh, city, CARS = [], carBusy = false, mode = 'loading', hudOn = true, camMode = (cfg.camStyle === 'simple' ? 1 : 0), minimapImg = null;
  document.body.classList.toggle('touch', isTouch);
  Input.init(); if (isTouch) Input.bindTouch();
  Sound.on = cfg.sound;
  const toastEl = $('toast'); let toastT = 0;
  function toast(msg, ms) { toastEl.textContent = msg; toastEl.classList.add('show'); toastT = (ms || 2200) / 1000; }
  function setProg(f, txt) { $('bar').style.transform = 'scaleX(' + Math.max(0.02, Math.min(1, f)) + ')'; if (txt) $('ptxt').textContent = txt; }
  async function fetchBuf(url, cb) {
    const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
    if (!r.body || !cb) return r.arrayBuffer();
    const rd = r.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; cb(got); }
    const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out.buffer;
  }
  const tick = () => new Promise((r) => setTimeout(r, 16));

  // ---------- qualidade / resolução dinâmica ----------
  let qName = 'med', dynScale = 1, ema = 16, lastAdj = 0, W = 0, H = 0;
  function pickQuality() { if (cfg.quality !== 'auto') return cfg.quality; return isTouch ? 'med' : 'high'; }
  function applyQuality() { const q = QUAL[qName = pickQuality()]; R.drawDist = q.dist; R.opt.ao = q.ao; R.setAniso(q.aniso); resize(); }
  function resize() {
    const q = QUAL[qName], dpr = Math.min(window.devicePixelRatio || 1, q.dpr), cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight;
    const s = q.scale * dynScale * dpr; W = Math.max(320, Math.round(cw * s)); H = Math.max(180, Math.round(ch * s)); R.resize(W, H);
  }
  addEventListener('resize', () => R && resize());

  // ---------- carros (assets/cars/cars.json) ----------
  const carBase = (c) => 'assets/cars/' + c.dir + '/';
  async function fetchCar(c, cb) { // baixa car.json + car.wasm de um carro
    const [man, buf] = await Promise.all([fetch(carBase(c) + 'car.json').then((r) => { if (!r.ok) throw new Error(c.dir + '/car.json ' + r.status); return r.json(); }), fetchBuf(carBase(c) + 'car.wasm', cb)]);
    return { man, buf };
  }
  // cria o veículo de um carro: geometria das rodas vem do próprio modelo; o resto vem de cars.json (params)
  function makeVehicle(c) {
    const man = c.man, S = c.scale || 1.2, FL = man.wheels.FL.pivot, RL = man.wheels.RL.pivot, FR = man.wheels.FR.pivot;
    const geo = { tx: (Math.abs(FL[0]) + Math.abs(FR[0])) / 2 * S, tz: (FL[2] - RL[2]) / 2 * S, wr: man.radius * S };
    const v = new Vehicle(world, { scale: S, params: Object.assign(geo, c.params || {}) }); v.cyl = c.cyl || 6; v.carId = c.id; return v;
  }
  const settle = (v) => { for (let i = 0; i < 180; i++) v.step(1 / 120, { throttle: 0, brake: 0, hb: 0, steer: 0 }); };
  async function selectCar(id) {
    const c = CARS.find((x) => x.id === id); if (!c || carBusy || (veh && veh.carId === id)) return; carBusy = true; renderCars(id);
    try {
      if (!c.man) { const kk = await fetchCar(c); await R.loadCar(kk.man, kk.buf, QUAL[qName].tex, carBase(c), c.paint); c.man = kk.man; }
      const prev = veh, nv = makeVehicle(c), sp = city.spawn;
      if (prev) { nv.place(prev.p[0], prev.p[1] + 0.8, prev.p[2], prev.yaw); settle(nv); nv.safe = prev.safe || { x: nv.p[0], y: nv.p[1], z: nv.p[2], yaw: prev.yaw }; }
      else { nv.place(sp.pos[0], sp.pos[1] + 0.8, sp.pos[2], sp.yaw); settle(nv); nv.safe = { x: nv.p[0], y: nv.p[1], z: nv.p[2], yaw: sp.yaw }; }
      veh = nv; R.setCar(c.man); applyPaint(c); cfg.car = id; save(); if (typeof FH2 !== 'undefined') { FH2.capture(R, veh, c); resize(); }
    } catch (e) { console.error(e); toast('Não consegui carregar ' + c.name, 3000); }
    carBusy = false; renderCars();
  }
  function renderCars(loadingId) { // desenha os cartões de seleção (menu inicial e menu de pausa)
    const t = $('tagline'); if (t) t.textContent = 'Mundo aberto · ' + CARS.length + (CARS.length === 1 ? ' carro' : ' carros');
    renderPaint();
    if (typeof FH2 !== 'undefined') FH2.update({ cars: CARS, current: veh && veh.carId, loading: loadingId, busy: carBusy });
    for (const box of [$('cars-start'), $('cars-pause')]) {
      if (!box) continue; box.hidden = CARS.length < 2; box.innerHTML = '';
      for (const c of CARS) {
        const b = document.createElement('button'); b.className = 'car' + (veh && veh.carId === c.id ? ' on' : '') + (loadingId === c.id ? ' loading' : ''); b.dataset.id = c.id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', veh && veh.carId === c.id ? 'true' : 'false');
        const cls = document.createElement('span'); cls.className = 'cls'; cls.textContent = [c.brand, c['class']].filter(Boolean).join(' · ');
        const nm = document.createElement('b'); nm.textContent = c.name; const sm = document.createElement('small');
        sm.textContent = loadingId === c.id ? 'Baixando ' + Math.round((c.bytes || 0) / 1048576 * 10) / 10 + ' MB…' : (c.specs || ''); b.append(cls, nm, sm); b.disabled = carBusy; box.appendChild(b);
      }
    }
  }
  for (const id of ['cars-start', 'cars-pause']) $(id).addEventListener('click', (e) => { const b = e.target.closest('button.car'); if (b) selectCar(b.dataset.id); });

  // ---------- pintura: troca so a cor da carroceria (rodas, vidros, luzes e interior nao mudam) ----------
  const PAINT_COLORS = [['Branco', '#f2f2f2'], ['Preto', '#0d0d10'], ['Cinza', '#6f757d'], ['Prata', '#c3c7cd'], ['Vermelho', '#c8102e'], ['Laranja', '#f26b1d'], ['Amarelo', '#f2c200'], ['Verde', '#1f7a3a'], ['Azul', '#1f4fd1'], ['Azul-claro', '#3aa7e0'], ['Roxo', '#6a2cc9'], ['Rosa', '#e8478f']];
  const paintOf = (id) => { const p = cfg.paint && cfg.paint[id]; return Array.isArray(p) ? p : []; };
  const curCar = () => veh && CARS.find((x) => x.id === veh.carId);
  function applyPaint(c) { if (!c || !c.man) return; (c.man.paintZones || []).forEach((z, i) => R.setPaint(c.man, i, paintOf(c.id)[i] || null)); }
  let paintT = 0;
  function setZoneColor(c, zi, hex, quiet) {
    const arr = paintOf(c.id).slice(); arr[zi] = hex || null; cfg.paint = cfg.paint || {};
    if (arr.every((v) => !v)) delete cfg.paint[c.id]; else cfg.paint[c.id] = Array.from(arr, (v) => v || null);
    save(); applyPaint(c); if (!quiet) renderPaint();
    clearTimeout(paintT); paintT = setTimeout(() => { if (veh && veh.carId === c.id && typeof FH2 !== 'undefined') { try { FH2.capture(R, veh, c); resize(); } catch (e) {} } }, 700); // atualiza a foto do carro na garagem
  }
  function renderPaint() {
    const c = curCar(), zones = (c && c.man && c.man.paintZones) || [];
    for (const box of [$('paint-start'), $('paint-pause')]) {
      if (!box) continue; box.innerHTML = ''; box.hidden = !zones.length; if (!zones.length) continue;
      const cur = paintOf(c.id), presets = c.paint && c.paint.colors ? c.paint.colors.map((x) => [x.name, x.hex]) : PAINT_COLORS;
      const head = document.createElement('div'); head.className = 'ptitle'; head.textContent = 'Pintura · ' + c.name; box.appendChild(head);
      zones.forEach((z, zi) => {
        const row = document.createElement('div'); row.className = 'prow';
        if (zones.length > 1) { const lb = document.createElement('span'); lb.textContent = z.name; row.appendChild(lb); }
        const sw = document.createElement('div'); sw.className = 'swatches';
        const mk = (label, hex) => {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (hex ? '' : ' orig') + ((cur[zi] || '').toLowerCase() === (hex || '').toLowerCase() ? ' on' : '');
          b.title = label; b.setAttribute('aria-label', label); if (hex) b.style.background = hex; b.dataset.zi = zi; b.dataset.hex = hex || ''; sw.appendChild(b);
        };
        mk('Original', null); for (const [n, h] of presets) mk(n, h);
        const inp = document.createElement('input'); inp.type = 'color'; inp.className = 'swcustom'; inp.value = cur[zi] || '#808080'; inp.title = 'Outra cor'; inp.setAttribute('aria-label', 'Outra cor'); inp.dataset.zi = zi; sw.appendChild(inp);
        row.appendChild(sw); box.appendChild(row);
      });
    }
  }
  for (const id of ['paint-start', 'paint-pause']) {
    const box = $(id); if (!box) continue;
    box.addEventListener('click', (e) => { const b = e.target.closest('button.sw'), c = curCar(); if (b && c) setZoneColor(c, +b.dataset.zi, b.dataset.hex || null); });
    box.addEventListener('input', (e) => { const i = e.target.closest('input.swcustom'), c = curCar(); if (i && c) setZoneColor(c, +i.dataset.zi, i.value, true); });
    box.addEventListener('change', (e) => { const i = e.target.closest('input.swcustom'), c = curCar(); if (i && c) { setZoneColor(c, +i.dataset.zi, i.value, true); renderPaint(); } });
  }

  // ---------- carga ----------
  async function boot() {
    try { R = new Renderer(canvas, { aa: !isTouch && pickQuality() === 'high', preserve: !!qs.get('shot') }); }
    catch (e) { console.error(e); $('ptxt').textContent = 'Seu navegador não suporta WebGL2. Tente Chrome, Edge, Firefox ou Safari recentes.'; $('bar').style.background = 'var(--hot)'; return; }
    const q0 = QUAL[pickQuality()]; setProg(0.02, 'Baixando mapa e carro…');
    const reg = await fetch('assets/cars/cars.json').then((r) => r.json()); CARS = reg.cars || [];
    if (!CARS.length) throw new Error('assets/cars/cars.json está vazio');
    const first = CARS.find((c) => c.id === cfg.car) || CARS[0];
    let gotC = 0, gotK = 0; const upd = () => setProg(0.04 + 0.5 * Math.min(1, (gotC + gotK) / (6.93e6 + (first.bytes || 4e6))), 'Baixando mapa e carro…');
    const [cm, cb, kk] = await Promise.all([
      fetch('assets/city.json').then((r) => r.json()), fetchBuf('assets/city.wasm', (g) => { gotC = g; upd(); }),
      fetchCar(first, (g) => { gotK = g; upd(); }),
    ]);
    city = cm; setProg(0.56, 'Carregando texturas…'); await tick();
    await R.loadCar(kk.man, kk.buf, q0.tex, carBase(first), first.paint); first.man = kk.man; setProg(0.66); await R.loadCity(cm, cb, q0.tex, (f) => setProg(0.66 + 0.2 * f));
    try { const [pm, pb] = await Promise.all([fetch('assets/props.json').then((r) => r.json()), fetchBuf('assets/props.wasm')]); await R.loadProps(pm, pb, q0.tex); window.__props = pm; } catch (e) { console.warn('props indisponíveis', e); R.props = null; }
    setProg(0.88, 'Construindo colisão do mapa…'); await tick();
    const col = buildCollision(cm, cb, window.__props); world = new World(col.V, col.surf, 16);
    const sp = cm.spawn; veh = makeVehicle(first); veh.place(sp.pos[0], sp.pos[1] + 0.8, sp.pos[2], sp.yaw); settle(veh);
    veh.safe = { x: veh.p[0], y: veh.p[1], z: veh.p[2], yaw: sp.yaw }; cfg.car = first.id; applyPaint(first); renderCars(); if (typeof FH2 !== 'undefined') FH2.capture(R, veh, first);
    minimapImg = new Image(); minimapImg.src = 'assets/' + cm.minimap.img;
    camYaw = sp.yaw; camPos = [veh.p[0] - Math.sin(sp.yaw) * 6, veh.p[1] + 2, veh.p[2] - Math.cos(sp.yaw) * 6]; camTgt = veh.p.slice();
    applyQuality(); setProg(1, 'Pronto');
    mode = 'menu'; $('start').disabled = false; $('start').textContent = isTouch ? 'Toque para começar' : 'Começar a dirigir'; $('ptxt').textContent = 'Mapa com ' + ((col.V.length / 9 / 1000) | 0) + ' mil triângulos de colisão';
    last = performance.now(); requestAnimationFrame(frame);
    if (qs.get('at')) { const a = qs.get('at').split(',').map(Number); veh.place(a[0], a[1] + 1, a[2], a[3] || 0); settle(veh); camYaw = a[3] || 0; camPos = [a[0] - Math.sin(camYaw) * 6, a[1] + 3, a[2] - Math.cos(camYaw) * 6]; } // depuração: ?at=x,y,z,yaw
    if (qs.get('auto')) startGame();
  }

  // ---------- câmera ----------
  let blurK = 0, camYaw = 0, camPos = [0, 0, 0], camTgt = [0, 0, 0], orbitYaw = 0, orbitPitch = 0, shake = 0, fovCur = 1.05, menuAng = 0;
  const CAMS = [{ n: 'Midnight Club', mlc: true, fov: 1.0 }, { n: 'Simples', d: 6.4, h: 2.1, fov: 1.0 }, { n: 'Perto', d: 4.4, h: 1.35, fov: 1.05 }, { n: 'Motorista', drv: true, d: 0, h: 0, fov: 1.12 }];
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  let lastCam = -1;
  const camOut = { pos: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1], fov: 1 };
  function nrm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function updateCamera(dt) {
    const c = CAMS[camMode], p = veh.p, sp = Math.hypot(veh.v[0], veh.v[2]), cs = veh.P.scale;
    const fovT = c.fov + Math.min(0.2, sp / 90 * 0.2); fovCur += (fovT - fovCur) * Math.min(1, 3 * dt);
    let pos, f = [0, 0, -1], up = [0, 1, 0];
    if (mode === 'menu') {
      menuAng += dt * 0.25; const d = 7.2 * cs, tg = [p[0], p[1] + 0.6 * cs, p[2]];
      pos = [tg[0] + Math.sin(menuAng) * d, tg[1] + 1.9 * cs, tg[2] + Math.cos(menuAng) * d]; f = nrm([tg[0] - pos[0], tg[1] - pos[1], tg[2] - pos[2]]);
    } else if (c.mlc) {
      if (lastCam !== camMode) { CamMLC.reset(); }
      const o = CamMLC.update(dt, veh, world, orbitYaw); pos = o.pos; f = o.f; up = o.up; fovCur = o.fov; blurK = o.blur;
    } else if (c.drv) {
      const Rm = veh.R, lx = 0.34 * cs, ly = 0.62 * cs, lz = 0.1 * cs;
      pos = [p[0] + Rm[0] * lx + Rm[1] * ly + Rm[2] * lz, p[1] + Rm[3] * lx + Rm[4] * ly + Rm[5] * lz, p[2] + Rm[6] * lx + Rm[7] * ly + Rm[8] * lz];
      f = [Rm[2], Rm[5], Rm[8]]; up = nrm([Rm[1] * 0.6, Rm[4] * 0.6 + 0.4, Rm[7] * 0.6]);
      if (orbitYaw) { const cy = Math.cos(orbitYaw), sy = Math.sin(orbitYaw); f = nrm([f[0] * cy + f[2] * sy, f[1], -f[0] * sy + f[2] * cy]); }
      camYaw = Math.atan2(f[0], f[2]);
    } else {
      const yaw = veh.yaw; let hd = yaw;
      if (sp > 5 && veh.fwdSpeed > 0) { const vh = Math.atan2(veh.v[0], veh.v[2]); hd = yaw + angDiff(vh, yaw) * clamp((sp - 5) / 16, 0, 0.55); }
      camYaw += angDiff(hd, camYaw) * (1 - Math.exp(-dt * (veh.drifting ? 2.2 : 3.6)));
      camTgt[0] += (p[0] - camTgt[0]) * (1 - Math.exp(-dt * 24)); camTgt[1] += (p[1] + 1.0 * cs - camTgt[1]) * (1 - Math.exp(-dt * 12)); camTgt[2] += (p[2] - camTgt[2]) * (1 - Math.exp(-dt * 24));
      const ya = camYaw + orbitYaw, dist = c.d * cs + Math.min(2.2, sp * 0.03), hh = c.h * cs + Math.min(0.5, sp * 0.004), tg = camTgt;
      const des = [tg[0] - Math.sin(ya) * dist, tg[1] + hh, tg[2] - Math.cos(ya) * dist];
      const dx = des[0] - tg[0], dy = des[1] - tg[1], dz = des[2] - tg[2], L = Math.hypot(dx, dy, dz);
      if (world.raycast(tg[0], tg[1], tg[2], dx / L, dy / L, dz / L, L + 0.4, -2)) { const t = Math.max(1.0, world.hit.t - 0.45); des[0] = tg[0] + dx / L * t; des[1] = tg[1] + dy / L * t + 0.1; des[2] = tg[2] + dz / L * t; }
      if (world.raycast(des[0], des[1] + 1.2, des[2], 0, -1, 0, 1.9, 0.2)) des[1] = Math.max(des[1], des[1] + 1.2 - world.hit.t + 0.55);
      const k = 1 - Math.exp(-dt * 16); camPos[0] += (des[0] - camPos[0]) * k; camPos[1] += (des[1] - camPos[1]) * (1 - Math.exp(-dt * 9)); camPos[2] += (des[2] - camPos[2]) * k;
      pos = camPos.slice(); f = nrm([tg[0] - pos[0], tg[1] - 0.3 - pos[1], tg[2] - pos[2]]);
    }
    if (shake > 0.001) { pos[0] += (Math.random() - 0.5) * shake * 0.25; pos[1] += (Math.random() - 0.5) * shake * 0.25; pos[2] += (Math.random() - 0.5) * shake * 0.25; shake *= Math.exp(-dt * 6); }
    const r = nrm(cross(f, up)); up = cross(r, f);
    camOut.pos = pos; camOut.fwd = f; camOut.right = r; camOut.up = up; camOut.fov = fovCur;
    lastCam = camMode;
  }

  // ---------- partículas ----------
  const NP = 380, P = { n: 0, data: new Float32Array(NP * 4), alpha: new Float32Array(NP), fov: 1 };
  const pp = new Float32Array(NP * 9); let pn = 0, emitAcc = 0;
  function emit(x, y, z, vx, vy, vz, size, life) { if (pn >= NP) return; const o = pn++ * 9; pp[o] = x; pp[o + 1] = y; pp[o + 2] = z; pp[o + 3] = vx; pp[o + 4] = vy; pp[o + 5] = vz; pp[o + 6] = life; pp[o + 7] = life; pp[o + 8] = size; }
  function updateParticles(dt) {
    if (mode === 'play' && QUAL[qName].scale > 0.5) {
      for (const w of veh.wheels) {
        if (!w.ground) continue; const dust = w.surf === 2 || w.surf === 3, rate = dust ? Math.min(1, veh.speed / 14) * 22 : w.skid * 70;
        if (rate < 2) continue; emitAcc += rate * dt; const n = emitAcc | 0; emitAcc -= n;
        for (let i = 0; i < n; i++) emit(w.px + (Math.random() - .5) * .3, w.py + 0.1, w.pz + (Math.random() - .5) * .3, veh.v[0] * 0.25 + (Math.random() - .5) * 1.2, 0.7 + Math.random() * 1.2, veh.v[2] * 0.25 + (Math.random() - .5) * 1.2, dust ? 0.9 : 0.7, dust ? 0.9 : 1.2);
      }
    }
    for (let i = 0; i < pn;) {
      const o = i * 9; pp[o + 6] -= dt; if (pp[o + 6] <= 0) { pn--; if (i < pn) pp.copyWithin(o, pn * 9, pn * 9 + 9); continue; }
      const dk = Math.exp(-1.6 * dt); pp[o + 3] *= dk; pp[o + 4] = pp[o + 4] * dk + 0.5 * dt; pp[o + 5] *= dk; pp[o] += pp[o + 3] * dt; pp[o + 1] += pp[o + 4] * dt; pp[o + 2] += pp[o + 5] * dt; pp[o + 8] += dt * 1.6; i++;
    }
    for (let i = 0; i < pn; i++) { const o = i * 9, t = pp[o + 6] / pp[o + 7]; P.data[i * 4] = pp[o]; P.data[i * 4 + 1] = pp[o + 1]; P.data[i * 4 + 2] = pp[o + 2]; P.data[i * 4 + 3] = pp[o + 8]; P.alpha[i] = Math.min(1, t * 1.6) * 0.38; }
    P.n = pn; P.fov = fovCur;
  }

  // ---------- HUD ----------
  const mm = $('mm'), mctx = mm.getContext('2d');
  function drawMinimap() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), css = mm.clientWidth || 150, px = Math.round(css * dpr); if (mm.width !== px) mm.width = mm.height = px;
    const s = px / 2; mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, px, px); mctx.fillStyle = '#0b1628'; mctx.fillRect(0, 0, px, px);
    if (minimapImg && minimapImg.complete && city) {
      const res = city.minimap.res, mx = (veh.p[0] - city.bounds[0]) / res, my = (veh.p[2] - city.bounds[2]) / res, scale = (px / 520) * res;
      mctx.save(); mctx.translate(s, s); mctx.rotate(veh.yaw - Math.PI); mctx.scale(scale, scale); mctx.translate(-mx, -my); mctx.drawImage(minimapImg, 0, 0); mctx.restore();
    }
    mctx.fillStyle = '#ffb02e'; mctx.strokeStyle = '#0a0e14'; mctx.lineWidth = 2 * dpr; mctx.beginPath(); mctx.moveTo(s, s - 9 * dpr); mctx.lineTo(s + 6 * dpr, s + 7 * dpr); mctx.lineTo(s, s + 3.5 * dpr); mctx.lineTo(s - 6 * dpr, s + 7 * dpr); mctx.closePath(); mctx.fill(); mctx.stroke();
  }
  const el = { spd: $('spd'), unit: $('unit'), gear: $('gear'), rpm: $('rpmfill') }; let hudT = 0;
  function updateHud(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 0.05;
    const mph = cfg.units === 'mph', sp = Math.abs(veh.fwdSpeed) * (mph ? 2.23694 : 3.6);
    el.spd.textContent = Math.round(sp); el.unit.textContent = mph ? 'mph' : 'km/h';
    el.gear.textContent = veh.gear < 0 ? 'R' : (Math.abs(veh.fwdSpeed) < 0.4 && veh.throttle < 0.05 ? 'N' : veh.gear);
    const pI = veh.P.idle, pM = veh.P.rpmMax; el.rpm.style.transform = 'scaleX(' + clamp((veh.rpm - pI) / (pM - pI), 0, 1).toFixed(3) + ')'; el.rpm.classList.toggle('red', veh.rpm > pM - 900);
    drawMinimap();
  }

  // ---------- menu ----------
  const show = (id, on) => { $(id).hidden = !on; };
  function startGame() {
    if (mode !== 'menu') return; Sound.start(); Sound.setOn(cfg.sound); mode = 'play'; show('menu', false); show('hud', true); if (isTouch) show('touch', true); Input.edge = {};
    toast(isTouch ? 'Arraste a faixa para esterçar' : 'WASD ou setas · Espaço: freio de mão · C: câmera · G: câmbio auto/manual · R: desvirar', 4200); $('hint').classList.add('show'); setTimeout(() => $('hint').classList.remove('show'), 14000);
    try { if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  }
  function setPause(p) {
    if (mode === 'play' && p) { mode = 'pause'; show('menu', true); show('p-start', false); show('p-pause', true); Sound.update({ rpm: 900, throttle: 0, skidAmt: 0, speed: 0, onGround: 0 }, true); }
    else if (mode === 'pause' && !p) { mode = 'play'; show('menu', false); last = performance.now(); }
  }
  $('start').addEventListener('click', startGame); $('resume').addEventListener('click', () => setPause(false)); $('b-pause').addEventListener('click', () => setPause(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
  function sync() {
    for (const b of document.querySelectorAll('.seg-q button')) b.classList.toggle('on', b.dataset.v === cfg.quality);
    for (const b of document.querySelectorAll('.seg-u button')) b.classList.toggle('on', b.dataset.v === cfg.units);
    for (const b of document.querySelectorAll('.seg-s button')) b.classList.toggle('on', (b.dataset.v === 'on') === !!cfg.sound);
    $('camname').textContent = CAMS[camMode].n;
    for (const b of document.querySelectorAll('.seg-cs button')) b.classList.toggle('on', b.dataset.v === (camMode === 0 ? 'mlc' : 'simple'));
    for (const b of document.querySelectorAll('.seg-fx button')) b.classList.toggle('on', b.dataset.v === (cfg.fx === 'off' ? 'off' : 'on'));
    for (const b of document.querySelectorAll('.seg-mr button')) b.classList.toggle('on', b.dataset.v === (cfg.mirror === 'off' ? 'off' : 'on'));
    for (const b of document.querySelectorAll('.seg-tr button')) b.classList.toggle('on', b.dataset.v === (cfg.trans === 'manual' ? 'manual' : 'auto'));
    document.body.classList.toggle('manual', cfg.trans === 'manual');
  }
  // ---------- câmbio: automático (padrão) / manual ----------
  const setTrans = (t, say) => { cfg.trans = t === 'manual' ? 'manual' : 'auto'; save(); sync(); if (say) toast(cfg.trans === 'manual' ? 'Câmbio MANUAL · E sobe · Q desce · G volta ao automático' : 'Câmbio AUTOMÁTICO', 1800); };
  document.addEventListener('pointerdown', (e) => { // botões do HUD (mouse ou toque): ▲ ▼ e AUTO/MANUAL
    const b = e.target.closest && e.target.closest('#b-up, #b-dn, #b-trans'); if (!b || mode !== 'play') return; e.preventDefault();
    if (b.id === 'b-trans') setTrans(cfg.trans === 'manual' ? 'auto' : 'manual', true); else Input.edge[b.id === 'b-up' ? 'shUp' : 'shDn'] = 1;
  });
  const segBind = (cls, key, fn) => { for (const box of document.querySelectorAll(cls)) box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; cfg[key] = key === 'sound' ? b.dataset.v === 'on' : b.dataset.v; save(); if (key === 'sound') Sound.setOn(cfg.sound); sync(); fn && fn(); }); };
  segBind('.seg-q', 'quality', () => { dynScale = 1; R && applyQuality(); }); segBind('.seg-u', 'units'); segBind('.seg-s', 'sound'); segBind('.seg-fx', 'fx'); segBind('.seg-mr', 'mirror');
  segBind('.seg-tr', 'trans');
  segBind('.seg-cs', 'camStyle', () => { camMode = cfg.camStyle === 'mlc' ? 0 : 1; if (typeof CamMLC !== 'undefined') CamMLC.reset(); sync(); });
  $('cam-btn').addEventListener('click', () => { camMode = (camMode + 1) % CAMS.length; if (camMode < 2) { cfg.camStyle = camMode === 0 ? 'mlc' : 'simple'; save(); } sync(); });
  $('reset-btn').addEventListener('click', () => { veh.respawn(false); setPause(false); });
  $('home-btn').addEventListener('click', () => { const s = city.spawn; veh.place(s.pos[0], s.pos[1] + 1, s.pos[2], s.yaw); camYaw = s.yaw; setPause(false); });
  $('fs-btn').addEventListener('click', () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} });
  sync();

  // ---------- laço ----------
  let last = 0, acc = 0, stuckT = 0, frames = 0, skidAmt = 0; const HZ = 1 / 120;
  function frame(now) {
    requestAnimationFrame(frame); let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0.016; if (dt > 0.1) dt = 0.1; frames++;
    const inp = Input.poll(dt);
    if (Input.take('mute')) { cfg.sound = !cfg.sound; save(); Sound.setOn(cfg.sound); sync(); toast(cfg.sound ? 'Som ligado' : 'Som desligado', 1200); }
    if (Input.take('hud')) { hudOn = !hudOn; $('hud').style.visibility = hudOn ? '' : 'hidden'; }
    if (mode === 'menu') { if (Input.take('padA') || Input.take('pause')) { if (!$('start').disabled) startGame(); } }
    else if (Input.take('pause')) setPause(mode === 'play');
    if (mode === 'play') {
      if (Input.take('cam')) { camMode = (camMode + 1) % CAMS.length; if (camMode < 2) { cfg.camStyle = camMode === 0 ? 'mlc' : 'simple'; save(); } sync(); toast('Câmera: ' + CAMS[camMode].n, 1100); }
      if (Input.take('reset')) { veh.respawn(false); toast('Carro desvirado', 1200); }
      if (Input.take('respawn')) { veh.respawn(true); toast('De volta à última rua segura', 1500); }
      if (Input.take('trans')) setTrans(cfg.trans === 'manual' ? 'auto' : 'manual', true);
      veh.manual = cfg.trans === 'manual';
      if (Input.take('shUp')) { if (veh.manual) veh.shiftReq = 1; } if (Input.take('shDn')) { if (veh.manual) veh.shiftReq = -1; }
      acc += dt; let n = 0; while (acc >= HZ && n < 10) { veh.step(HZ, inp); acc -= HZ; n++; } if (n === 10) acc = 0;
      orbitYaw += ((inp.orbit || 0) * 1.4 - orbitYaw) * Math.min(1, 6 * dt) * (inp.orbit ? 1 : 0.4); if (!inp.orbit) orbitYaw *= Math.exp(-2.5 * dt);
      if (veh.impact > 3.5) { Sound.crash(veh.impact); Input.rumble(veh.impact / 20, 180); shake = Math.min(1.6, veh.impact / 9); if (veh.impact > 8) toast('Batida!', 700); }
      veh.impact = 0;
      let sk = 0; for (const w of veh.wheels) if (w.ground) sk = Math.max(sk, w.skid); skidAmt += (sk - skidAmt) * Math.min(1, 10 * dt);
      if (veh.inWater > 1.6) { veh.respawn(true); toast('Caiu na água · voltando para a rua', 2200); }
      if (veh.p[1] < -60 || veh.p[0] < -300 || veh.p[0] > 2700 || veh.p[2] > 400 || veh.p[2] < -3500) { veh.respawn(true); toast('Fora do mapa · voltando para a rua', 2200); }
      if (veh.flipT > 3) { veh.respawn(false); toast('Carro desvirado', 1200); }
      if ((inp.throttle > 0.5 || inp.brake > 0.5) && veh.speed < 0.7 && veh.onGround) { stuckT += dt; if (stuckT > 5) { toast('Preso? R desvira o carro, T volta para a rua', 3500); stuckT = -6; } } else if (stuckT > 0) stuckT = 0;
      veh.skidAmt = skidAmt; Sound.update(veh, false);
    }
    if (mode === 'play' || mode === 'menu') updateCamera(dt); else if (mode === 'pause') updateCamera(0);
    if (mode !== 'pause') updateParticles(dt);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('show'); }
    if (mode === 'play') updateHud(dt);
    if (typeof HudBlur !== 'undefined' && (mode === 'play' || mode === 'pause')) HudBlur.update(mode === 'play' ? dt : 0, veh, cfg, mode);
    let shadow = null;
    if (world.raycast(veh.p[0], veh.p[1], veh.p[2], 0, -1, 0, 25, 0.4)) {
      const h = world.hit, n = [h.nx, h.ny, h.nz], Rm = veh.R; let f = [Rm[2], Rm[5], Rm[8]]; const d = f[0] * n[0] + f[1] * n[1] + f[2] * n[2]; f = nrm([f[0] - n[0] * d, f[1] - n[1] * d, f[2] - n[2] * d]);
      shadow = { c: [veh.p[0], veh.p[1] - h.t, veh.p[2]], n, f, r: nrm(cross(f, n)), a: clamp(0.62 - (h.t - 0.55) * 0.09, 0, 0.62) };
    }
    R.render({ cam: camOut, time: now / 1000, particles: P, car: { R: veh.R, p: veh.p, wheels: veh.wheels, steerA: veh.steerA, hModel: veh.P.hCom, scale: veh.P.scale, anchorY: veh.P.anchorY, brake: mode === 'play' ? (veh.gear < 0 ? veh.throttle : veh.brake) : 0, shadow, hideBody: mode === 'play' && !!CAMS[camMode].drv } });
    if (mode === 'play' || mode === 'pause') {
      const rc = typeof HudBlur !== 'undefined' ? HudBlur.mirrorRect(cfg, mode) : null; if (rc && (qName !== 'low' || qs.get('mirror'))) { const dd = R.drawDist; R.drawDist = Math.min(dd, 380); R.render({ cam: HudBlur.mirrorCam(veh), time: now / 1000, rect: rc, flipX: true, car: Object.assign({}, { R: veh.R, p: veh.p, wheels: veh.wheels, steerA: veh.steerA, hModel: veh.P.hCom, scale: veh.P.scale, anchorY: veh.P.anchorY, brake: 0, shadow: null, hideBody: true }) }); R.drawDist = dd; }
    }
    if (typeof HudBlur !== 'undefined') HudBlur.fx(cfg, mode, CAMS[camMode].mlc ? blurK : Math.min(1, Math.max(0, (Math.hypot(veh.v[0], veh.v[2]) - 22) / 48)));
    ema += (dt * 1000 - ema) * 0.05; lastAdj += dt;
    if (cfg.quality === 'auto' && mode === 'play' && lastAdj > 1.5) {
      if (ema > 24 && dynScale > 0.5) { dynScale = Math.max(0.5, dynScale - 0.1); resize(); lastAdj = 0; }
      else if (ema < 13.5 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); resize(); lastAdj = 0; }
    }
    if (qs.get('debug')) $('dbg').textContent = ema.toFixed(1) + ' ms · ' + R.stats.calls + ' draws · ' + W + 'x' + H + ' · ' + qName + ' x' + dynScale.toFixed(2);
  }
  window.__game = { paintReport() { const c = curCar(), m = c && c.man; return m ? { car: c.id, zonas: (m.paintZones || []).map((z) => ({ nome: z.name, materiais: z.mats.map((i) => m.mats[i].name) })), materiais: m.mats.map((x, i) => i + ': ' + x.name + (x.pz !== undefined ? '  <== PINTURA' : '')) } : null; }, save, selectCar, get cars() { return CARS; }, get veh() { return veh; }, get world() { return world; }, get R() { return R; }, get mode() { return mode; }, cfg, start: startGame, setCam(m) { camMode = m; }, get frames() { return frames; }, get cam() { return camOut; } };
  boot().catch((e) => { console.error(e); $('ptxt').textContent = 'Erro ao carregar: ' + e.message; $('bar').style.background = 'var(--hot)'; });
})();
