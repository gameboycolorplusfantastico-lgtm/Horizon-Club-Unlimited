// ===================== TRÁFEGO DE NPCs (mão americana) =====================
// Grafo de ruas: assets/traffic.json (gerado do mapa por tools/mapa/traffic_graph.py). Modelos: assets/npc/ (tools/make_npc.py).
// Cada rua tem 2 faixas (uma por sentido, na DIREITA de quem anda). Nos cruzamentos o carro faz uma curva (Bezier) até a faixa de saída.
// Respeita: semáforos (mesmo ciclo desenhado pelo jogo, R.sigState), cruzamentos sem semáforo (um de cada vez), distância do carro da frente (IDM),
// e o jogador (sempre tem preferência). Batida: o NPC é empurrado, fica parado e some depois.
const Traffic = (() => {
  const TAU = Math.PI * 2;
  let ok = false, nodes = [], lanes = [], models = null, props = null, R = null, cars = [], nid = 1, conns = new Map(), spawnT = 0, lastLog = 0;
  const cfgT = { count: 36, ring0: 70, ring1: 320, despawn: 360, enabled: true };
  const rnd = Math.random;

  // ---------- grafo ----------
  function build(tj, pr) {
    props = pr; nodes = tj.nodes.map((n) => Object.assign({ arr: [], dep: [], claim: null, deg: 0 }, n)); lanes = [];
    for (const e of tj.edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
    for (const n of nodes) n.R2 = n.deg >= 3 ? n.R : Math.min(n.R, 3.5);
    for (const e of tj.edges) {
      const n = e.p.length / 3, X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n), S = new Float64Array(n), Wd = e.w;
      for (let i = 0; i < n; i++) { X[i] = e.p[i * 3]; Y[i] = e.p[i * 3 + 1]; Z[i] = e.p[i * 3 + 2]; if (i) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Z[i] - Z[i - 1]); }
      const Lt = S[n - 1]; if (Lt < 6) continue;
      const ra = Math.min(nodes[e.a].R2, Lt * 0.36), rb = Math.min(nodes[e.b].R2, Lt * 0.36);
      for (const dir of [1, -1]) {
        const s0 = dir > 0 ? ra : rb, s1 = Lt - (dir > 0 ? rb : ra), len = s1 - s0; if (len < 3) continue;
        const m = Math.max(2, Math.round(len / 2.5) + 1), px = new Float64Array(m), py = new Float64Array(m), pz = new Float64Array(m), hx = new Float64Array(m), hz = new Float64Array(m), sc = new Float64Array(m);
        const sample = (s) => { // interpola a linha central em s (distancia desde o no a)
          let k = 1; while (k < n - 1 && S[k] < s) k++; const t = (s - S[k - 1]) / Math.max(1e-6, S[k] - S[k - 1]), u = Math.min(1, Math.max(0, t));
          return [X[k - 1] + (X[k] - X[k - 1]) * u, Y[k - 1] + (Y[k] - Y[k - 1]) * u, Z[k - 1] + (Z[k] - Z[k - 1]) * u, X[k] - X[k - 1], Z[k] - Z[k - 1], Wd[k - 1] + (Wd[k] - Wd[k - 1]) * u];
        };
        let wsum = 0;
        for (let i = 0; i < m; i++) {
          const s = dir > 0 ? s0 + len * i / (m - 1) : s1 - len * i / (m - 1), q = sample(s); let tx = q[3] * dir, tz = q[4] * dir; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const off = Math.min(4.4, Math.max(1.7, q[5] * 0.25)); wsum += q[5];
          px[i] = q[0] + -tz * off; pz[i] = q[2] + tx * off; py[i] = q[1]; hx[i] = tx; hz[i] = tz; sc[i] = i ? sc[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]) : 0;
        }
        const w = wsum / m, from = dir > 0 ? e.a : e.b, to = dir > 0 ? e.b : e.a;
        const L = { id: lanes.length, e, dir, from, to, n: m, x: px, y: py, z: pz, hx, hz, s: sc, len: sc[m - 1], w, lim: e.t === 'B' ? 19 : (w < 9 ? 11 : (w < 13.5 ? 14 : 17)), axis: -1, sigJ: -1, opp: null };
        lanes.push(L); nodes[from].dep.push(L); nodes[to].arr.push(L);
      }
    }
    for (const a of lanes) for (const b of lanes) if (a.e === b.e && a.dir === -b.dir) a.opp = b;
    // semaforo de cada faixa de chegada: sinaleira do mesmo cruzamento mais alinhada com o sentido de chegada (eixo da sinaleira)
    for (const L of lanes) {
      const nd = nodes[L.to]; if (nd.j < 0 || !props) continue; const dx = L.hx[L.n - 1], dz = L.hz[L.n - 1]; let best = null, bd = 0.55;
      for (const s of props.sigs) { if (s[5] !== nd.j) continue; const d = Math.abs(dx * s[3] + dz * s[4]); if (d > bd) { bd = d; best = s; } }
      if (best) { L.axis = best[6]; L.sigJ = nd.j; }
    }
    ok = lanes.length > 0;
  }
  // curva de ligação (Bezier cúbica) entre o fim de uma faixa e o início de outra
  function connector(a, b) {
    const key = a.id * 4096 + b.id; let c = conns.get(key); if (c) return c;
    const i = a.n - 1, p0 = [a.x[i], a.y[i], a.z[i]], t0 = [a.hx[i], a.hz[i]], p1 = [b.x[0], b.y[0], b.z[0]], t1 = [b.hx[0], b.hz[0]];
    const d = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), k = Math.max(2.5, d * 0.42), m = Math.max(4, Math.round(d / 2));
    const c1 = [p0[0] + t0[0] * k, p0[2] + t0[1] * k], c2 = [p1[0] - t1[0] * k, p1[2] - t1[1] * k];
    const x = new Float64Array(m + 1), y = new Float64Array(m + 1), z = new Float64Array(m + 1), hx = new Float64Array(m + 1), hz = new Float64Array(m + 1), s = new Float64Array(m + 1);
    for (let j = 0; j <= m; j++) {
      const t = j / m, u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      x[j] = b0 * p0[0] + b1 * c1[0] + b2 * c2[0] + b3 * p1[0]; z[j] = b0 * p0[2] + b1 * c1[1] + b2 * c2[1] + b3 * p1[2]; y[j] = p0[1] + (p1[1] - p0[1]) * t;
      const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]), dz = 3 * u * u * (c1[1] - p0[2]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[2] - c2[1]), l = Math.hypot(dx, dz) || 1;
      hx[j] = dx / l; hz[j] = dz / l; if (j) s[j] = s[j - 1] + Math.hypot(x[j] - x[j - 1], z[j] - z[j - 1]);
    }
    // curvatura maxima -> velocidade da curva
    let turn = 0; for (let j = 1; j <= m; j++) turn += Math.abs(Math.atan2(hx[j - 1] * hz[j] - hz[j - 1] * hx[j], hx[j - 1] * hx[j] + hz[j - 1] * hz[j]));
    const cross = t0[0] * t1[1] - t0[1] * t1[0], dot = t0[0] * t1[0] + t0[1] * t1[1]; // cross > 0 => curva para o lado +X do jogo (ESQUERDA de quem anda)
    c = { n: m + 1, x, y, z, hx, hz, s, len: s[m], vmax: turn > 2.4 ? 4.2 : (turn > 0.5 ? 6.2 : 99), turn: Math.atan2(cross, dot), a, b }; conns.set(key, c); return c;
  }
  function pickNext(a) {
    const nd = nodes[a.to], opts = nd.dep.filter((b) => b.e !== a.e); const list = opts.length ? opts : (a.opp ? [a.opp] : []); if (!list.length) return null;
    let tot = 0; const w = list.map((b) => { const c = connector(a, b), ang = Math.abs(c.turn); const wt = ang < 0.45 ? 3.2 : (ang < 2.4 ? 1.1 : 0.15); tot += wt; return wt; });
    let r = rnd() * tot; for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[list.length - 1];
  }

  // ---------- veículos ----------
  function pickModel() {
    const ms = models.models, r = rnd(); const pool = (k) => ms.filter((m) => m.kind === k);
    const kind = r < 0.07 ? 'police' : (r < 0.19 ? 'truck' : (r < 0.21 ? 'limo' : 'car')), good = pool(kind);
    const l = good.length ? good : pool('car'); return l[Math.floor(rnd() * l.length)];
  }
  function placeOnLane(c, lane, s) {
    c.lane = lane; c.conn = null; c.s = s; c.next = pickNext(lane); c.nextConn = c.next ? connector(lane, c.next) : null; c.node = nodes[lane.to];
  }
  let cand = [], candT = -9, burst = true;
  function refreshCand(px, pz) { // faixas que tem algum trecho dentro do anel de nascimento (evita sortear faixas do mapa inteiro)
    cand = []; const r1 = cfgT.ring1 + 30;
    for (const L of lanes) { if (L.len < 14) continue; const mx = L.x[L.n >> 1], mz = L.z[L.n >> 1]; if (Math.abs(mx - px) < r1 + L.len * 0.5 && Math.abs(mz - pz) < r1 + L.len * 0.5) cand.push(L); }
  }
  function spawn(px, pz, hx, hz, first) {
    if (!lanes.length || cars.length >= cfgT.count || !cand.length) return false;
    const L = cand[Math.floor(rnd() * cand.length)];
    const s = rnd() * (L.len - 8) + 4, p = poseOn(L, s), dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
    if (d < (first ? 45 : cfgT.ring0) || d > cfgT.ring1) return false;
    if (!first && (dx * hx + dz * hz) / d > 0.7 && d < 130) return false; // nao nasce na frente do jogador, perto (aparecer do nada)
    const md = pickModel(); for (const o of cars) if (Math.hypot(o.x - p.x, o.z - p.z) < (md.length + o.model.length) * 0.5 + 6) return false;
    const c = { id: nid++, model: md, x: p.x, y: p.y, z: p.z, yaw: Math.atan2(p.hx, p.hz), pitch: 0, hx: p.hx, hz: p.hz, v: Math.min(L.lim * 0.8, 9), vd: L.lim * (0.82 + rnd() * 0.22), dist: 0, wait: 0, ghost: 0, hit: 0, kx: 0, kz: 0, brake: false, claimNode: null, age: 0, wmass: md.kind === 'truck' ? 6000 : 1400 };
    placeOnLane(c, L, s); cars.push(c); return true;
  }
  function poseOn(path, s) {
    const n = path.n, S = path.s; let lo = 0, hi = n - 1; if (s <= 0) return { x: path.x[0], y: path.y[0], z: path.z[0], hx: path.hx[0], hz: path.hz[0] };
    if (s >= S[n - 1]) return { x: path.x[n - 1], y: path.y[n - 1], z: path.z[n - 1], hx: path.hx[n - 1], hz: path.hz[n - 1] };
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]); let hx = path.hx[lo] + (path.hx[hi] - path.hx[lo]) * t, hz = path.hz[lo] + (path.hz[hi] - path.hz[lo]) * t; const hl = Math.hypot(hx, hz) || 1;
    return { x: path.x[lo] + (path.x[hi] - path.x[lo]) * t, y: path.y[lo] + (path.y[hi] - path.y[lo]) * t, z: path.z[lo] + (path.z[hi] - path.z[lo]) * t, hx: hx / hl, hz: hz / hl };
  }
  function sigGreen(L, T, dist, v) { // true = pode passar. amarelo: passa so se nao der para frear com conforto
    if (L.axis < 0 || !R || !R.sigState) return true; const st = R.sigState(L.sigJ, L.axis, T);
    if (st === 2) return true; if (st === 1) return dist < v * 1.1 + 1.5 || dist < 5; return false;
  }

  function step(dt, veh, T) {
    const px = veh.p[0], pz = veh.p[2], pvx = veh.v[0], pvz = veh.v[2], pf = Math.hypot(veh.R[2], veh.R[8]) || 1, phx = veh.R[2] / pf, phz = veh.R[8] / pf;
    candT -= dt; if (candT <= 0 || !cand.length) { candT = 1.0; refreshCand(px, pz); }
    if (cars.length === 0) burst = true;
    if (burst) { for (let k = 0; k < 400 && cars.length < cfgT.count; k++) spawn(px, pz, phx, phz, true); burst = false; spawnT = 0; }
    spawnT -= dt; if (spawnT <= 0) { spawnT = 0.1; for (let k = 0; k < 12 && cars.length < cfgT.count; k++) if (spawn(px, pz, phx, phz)) break; }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i], d = Math.hypot(c.x - px, c.z - pz); c.age += dt;
      if (d > cfgT.despawn || (c.hit > 0 && c.hitT > 14 && d > 30) || c.y < -5) { release(c); cars.splice(i, 1); continue; }
      if (c.hit > 0) { wreckStep(c, dt); continue; }
      drive(c, dt, T, px, pz, pvx, pvz, phx, phz);
    }
  }
  function release(c) { if (c.claimNode && c.claimNode.claim === c) c.claimNode.claim = null; }
  function wreckStep(c, dt) {
    c.hitT += dt; const f = Math.exp(-1.6 * dt); c.kx *= f; c.kz *= f; c.x += c.kx * dt; c.z += c.kz * dt; c.v *= Math.exp(-2 * dt); c.brake = true; c.yaw += (c.spinV || 0) * dt; c.spinV = (c.spinV || 0) * Math.exp(-1.8 * dt);
    c.hx = Math.sin(c.yaw); c.hz = Math.cos(c.yaw); release(c);
  }
  function drive(c, dt, T, px, pz, pvx, pvz, phx, phz) {
    const path = c.conn || c.lane, len = path.len; let vlim = c.conn ? Math.min(c.vd, c.conn.vmax) : c.vd; if (!c.conn) vlim = Math.min(vlim, c.vd);
    // limite de velocidade na proxima curva
    if (!c.conn && c.nextConn && c.nextConn.vmax < 90) { const dEnd = len - c.s, vt = c.nextConn.vmax; if (dEnd < 40) vlim = Math.min(vlim, Math.sqrt(vt * vt + 2 * 3 * Math.max(0, dEnd - 3))); }
    // ---- "obstaculos" na frente: gap (m) e velocidade do obstaculo ----
    let gap = 1e9, ov = 0, o_cur = null; c.why = ''; const fx = c.hx, fz = c.hz, rx = -fz, rz = fx, hw = c.model.width * 0.5, hl = c.model.length * 0.5;
    const look = (ox, oz, ovx, ovz, ohw, ohl, prio) => {
      const dx = ox - c.x, dz = oz - c.z, f = dx * fx + dz * fz; if (f < -1 || f > 45) return;
      const l = dx * rx + dz * rz, vfx = ovx * fx + ovz * fz;
      // 1) logo a frente (mesma faixa / curva): corredor lateral
      if (f > 0 && Math.abs(l) < hw + ohw * 0.9 + 0.35) { const g = f - hl - ohl; if (g < gap) { gap = g; ov = Math.max(0, vfx); c.why = 'car'; c.whyO = o_cur; } return; }
      // 2) cruzamento: previsao de posicao em 2,2 s
      const rvx = ovx - c.v * fx, rvz = ovz - c.v * fz, rv2 = rvx * rvx + rvz * rvz; if (rv2 < 0.5) return;
      const tc = Math.max(0, -(dx * rvx + dz * rvz) / rv2); if (tc > 2.2 || f < 0.5) return;
      const cx = dx + rvx * tc, cz = dz + rvz * tc; const dm = Math.hypot(cx, cz);
      if (dm < (hw + ohw) * 0.95 + 0.4 && prio) { const g = Math.max(0.5, f - hl - ohl - 1.0); if (g < gap) { gap = g; ov = 0; c.why = 'xing'; c.whyO = o_cur; } }
    };
    o_cur = 'player'; if (!cfgT.ignorePlayer) look(px, pz, pvx, pvz, 0.95, 2.3, true);
    for (const o of cars) {
      if (o === c || (c.ghost > 0 && !(o.lane === c.lane && !o.conn && !c.conn && o.s > c.s))) continue; const dx = o.x - c.x, dz = o.z - c.z; if (dx * dx + dz * dz > 2500) continue;
      const beh = dx * fx + dz * fz; if (beh < -1) continue;
      const ovx = o.hit > 0 ? o.kx : o.hx * o.v, ovz = o.hit > 0 ? o.kz : o.hz * o.v;
      o_cur = o; look(o.x, o.z, ovx, ovz, o.model.width * 0.5, o.model.length * 0.5, o.id < c.id || o.hit > 0);
    }
    // ---- semáforo / cruzamento no fim da faixa ----
    if (!c.conn && c.node) {
      const dist = len - c.s - 0.8, nd = c.node, L = c.lane;
      if (c.next && dist > -1) {
        let stop = false;
        if (L.axis >= 0) { if (!sigGreen(L, T, dist, c.v)) stop = true; }
        else if (nd.deg >= 3 && nd.j < 0 && !(c.ghost > 0)) { // cruzamento sem semaforo: um de cada vez
          if (nd.claim && nd.claim !== c && cars.includes(nd.claim) && nd.claim.hit <= 0 && T - nd.claimT < 9) stop = dist < 40; else if (dist < 3.5 && c.v < 3) { nd.claim = c; nd.claimT = T; c.claimNode = nd; }
          if (!stop && dist < 30) vlim = Math.min(vlim, 7.5);
        }
        if (!stop && dist < 25 && nd.deg >= 3 && !(c.ghost > 0)) { // nao entra no cruzamento se a faixa de saida nao tem espaco (evita travar o cruzamento)
          const need = Math.min(c.model.length + 2.5, c.next.len * 0.5); for (const o of cars) if (o !== c && (o.conn ? o.conn.b === c.next : (o.lane === c.next && o.s < need))) { stop = true; break; }
        }
        if (stop && dist < 70) { const g = Math.max(0.05, dist); if (g < gap) { gap = g; ov = 0; c.why = L.axis >= 0 ? 'signal' : 'claim'; } }
      }
    }
    // ---- IDM ----
    const a0 = 2.3, b0 = 3.6, T0 = 1.25, s0 = 2.2;
    let acc = a0 * (1 - Math.pow(c.v / Math.max(2, vlim), 4));
    if (gap < 1e8) { const dv = c.v - ov, sx = s0 + Math.max(0, c.v * T0 + c.v * dv / (2 * Math.sqrt(a0 * b0))); acc -= a0 * (sx / Math.max(0.3, gap)) * (sx / Math.max(0.3, gap)); }
    acc = Math.max(acc, -9); c.brake = acc < -1.2 || (c.v < 0.5 && gap < 8);
    c.v = Math.max(0, c.v + acc * dt); if (gap < 2.2 && c.v < 0.4) c.v = 0;
    // fila travada ha muito tempo (impasse): atravessa como fantasma
    if (c.v < 0.3 && gap < 12) c.wait += dt; else c.wait = Math.max(0, c.wait - dt * 2); if (c.wait > 9) { c.ghost = 5; c.wait = 0; } if (c.ghost > 0) c.ghost -= dt;
    c.s += c.v * dt;
    // fim do trecho
    if (c.s >= len) {
      c.s -= len;
      if (c.conn) { const lane = c.conn.b; release(c); c.claimNode = null; placeOnLane(c, lane, c.s); }
      else if (c.next) { c.conn = c.nextConn; c.node = null; if (c.s >= c.conn.len) { c.s = 0; } }
      else { c.s = 0; c.hit = 1; c.hitT = 99; }
    }
    const pth = c.conn || c.lane, q = poseOn(pth, c.s), tgt = Math.atan2(q.hx, q.hz); let dy = tgt - c.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    const kd = Math.exp(-3 * dt); c.kx *= kd; c.kz *= kd;
    /* cola no chao real do mapa (rampas, pontes, degraus) */
    c.yaw += dy * Math.min(1, 12 * dt); c.x = q.x + c.kx; c.z = q.z + c.kz; let sy = q.y; if (Traffic.world && Traffic.world.raycast(q.x, sy + 1.2, q.z, 0, -1, 0, 3, 0.35)) { const gy = sy + 1.2 - Traffic.world.hit.t; if (Math.abs(gy - sy) < 1.0) sy = gy; } const dyv = sy - c.y; if (Math.abs(dyv) > 3) c.y = sy; else c.y += dyv * Math.min(1, 14 * dt);
    const q2 = poseOn(pth, c.s + 2.5); c.pitch += (Math.max(-0.3, Math.min(0.3, Math.atan2(q2.y - q.y, 2.5))) - c.pitch) * Math.min(1, 6 * dt);
    c.hx = Math.sin(c.yaw); c.hz = Math.cos(c.yaw); c.dist += c.v * dt;
  }

  // ---------- colisão com o jogador ----------
  function collide(veh, dt) {
    if (!cars.length) return; const p = veh.p, R3 = veh.R, S = veh.P.scale || 1;
    for (const c of cars) {
      const dx = c.x - p[0], dz = c.z - p[2]; if (dx * dx + dz * dz > 49 || Math.abs(c.y - p[1]) > 3.5) continue;
      const hl = c.model.length * 0.5, hw = c.model.width * 0.5, rr = hw * 0.92, offs = [-hl + rr, -hl * 0.33, hl * 0.33, hl - rr];
      for (const sp of veh.spheres) {
        const lx = sp[0], ly = sp[1], lz = sp[2], r = sp[3];
        const wx = R3[0] * lx + R3[1] * ly + R3[2] * lz + p[0], wy = R3[3] * lx + R3[4] * ly + R3[5] * lz + p[1], wz = R3[6] * lx + R3[7] * ly + R3[8] * lz + p[2];
        if (wy < c.y + 0.12 - r || wy > c.y + c.model.height + r) continue;
        for (const o of offs) {
          const nx0 = c.x + c.hx * o, nz0 = c.z + c.hz * o, ex = wx - nx0, ez = wz - nz0, dd = Math.hypot(ex, ez), pen = r + rr - dd; if (pen <= 0) continue;
          const nx = dd > 1e-4 ? ex / dd : 1, nz = dd > 1e-4 ? ez / dd : 0;
          const cvx = c.hit > 0 ? c.kx : c.hx * c.v, cvz = c.hit > 0 ? c.kz : c.hz * c.v, rel = (veh.v[0] - cvx) * nx + (veh.v[2] - cvz) * nz;
          p[0] += nx * pen * 0.5; p[2] += nz * pen * 0.5; c.kx -= nx * pen * 0.35; c.kz -= nz * pen * 0.35;
          if (rel < 0) {
            const mp = veh.P.mass, mn = c.wmass, j = -(1.18) * rel / (1 / mp + 1 / mn);
            veh.v[0] += nx * j / mp; veh.v[2] += nz * j / mp; veh.impact = Math.max(veh.impact || 0, -rel);
            if (-rel > 1.5 || c.hit > 0) { c.hit = 1; c.hitT = c.hitT || 0; c.kx -= nx * j / mn * 0.55; c.kz -= nz * j / mn * 0.55; c.spinV = (c.spinV || 0) + (ex * nz - ez * nx > 0 ? 1 : -1) * Math.min(2.2, -rel * 0.12); release(c); }
            else { c.v = Math.max(0, c.v - 2); }
          }
        }
      }
    }
  }

  // ---------- desenho ----------
  const pool = [];
  function frame(veh) {
    const out = []; let k = 0;
    for (const c of cars) {
      let n = pool[k]; if (!n) { n = pool[k] = { M: new Float32Array(16), W: [], r: 8, fx: 0, fz: 1, rx: -1, rz: 0, gy: 0, model: null, brake: false }; } k++;
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch); const M = n.M; M.fill(0);
      M[0] = cy; M[2] = -sy; M[4] = -sp * sy; M[5] = cp; M[6] = -sp * cy; M[8] = sy * cp; M[9] = sp; M[10] = cy * cp; M[12] = c.x; M[13] = c.y; M[14] = c.z; M[15] = 1;
      n.model = c.model; n.brake = c.brake; n.fx = sy; n.fz = cy; n.rx = -cy; n.rz = sy; n.gy = c.y; n.r = c.model.length * 0.7;
      const ws = c.model.wheels; while (n.W.length < ws.length) n.W.push(new Float32Array(16));
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i], W = n.W[i], pv = w.pivot, ang = c.dist / Math.max(0.25, w.r), cs = Math.cos(ang), ss = Math.sin(ang);
        // W = M * T(pivot) * RotX(spin)
        const lx = M[0] * pv[0] + M[4] * pv[1] + M[8] * pv[2] + M[12], ly = M[1] * pv[0] + M[5] * pv[1] + M[9] * pv[2] + M[13], lz = M[2] * pv[0] + M[6] * pv[1] + M[10] * pv[2] + M[14];
        W[0] = M[0]; W[1] = M[1]; W[2] = M[2]; W[3] = 0;
        W[4] = M[4] * cs + M[8] * ss; W[5] = M[5] * cs + M[9] * ss; W[6] = M[6] * cs + M[10] * ss; W[7] = 0;
        W[8] = -M[4] * ss + M[8] * cs; W[9] = -M[5] * ss + M[9] * cs; W[10] = -M[6] * ss + M[10] * cs; W[11] = 0; W[12] = lx; W[13] = ly; W[14] = lz; W[15] = 1;
      }
      out.push(n);
    }
    return out;
  }
  async function init(r, tj, pr, nm, nb, texScale) {
    R = r; models = nm; await r.loadNpc(nm, nb, texScale); build(tj, pr); r.sigState = r.sigState || null;
    console.log('Trafego: ' + lanes.length + ' faixas, ' + nodes.length + ' nos, ' + nm.models.length + ' modelos');
  }
  return {
    init, step, collide, frame, build, world: null,
    debugSpawn(id, x, y, z, yaw) { const md = models.models.find((m) => m.id === id); const c = { id: nid++, model: md, x, y, z, yaw, pitch: 0, hx: Math.sin(yaw), hz: Math.cos(yaw), v: 0, vd: 0, dist: 0, wait: 0, ghost: 0, hit: 1, hitT: -1e9, kx: 0, kz: 0, brake: false, claimNode: null, age: 0, wmass: 1400 }; cars.push(c); return c; },
    get ok() { return ok; }, get cars() { return cars; }, get lanes() { return lanes; }, get nodes() { return nodes; }, cfg: cfgT,
    setCount(n) { cfgT.count = n; while (cars.length > n) cars.pop(); },
    clear() { cars.length = 0; burst = true; for (const n of nodes) n.claim = null; },
  };
})();
