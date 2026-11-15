// ===================== NÚCLEO: mundo de colisão + veículo =====================
// Sem dependências de DOM: roda no navegador e no Node (testes de física).
const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (x) => (x < 0 ? -1 : 1);

// --- ponto mais próximo em triângulo (Ericson) --- resultado em CP[0..2]
const CP = new Float64Array(3);
function closestPtTri(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { CP[0] = ax; CP[1] = ay; CP[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { CP[0] = bx; CP[1] = by; CP[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); CP[0] = ax + abx * v; CP[1] = ay + aby * v; CP[2] = az + abz * v; return; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { CP[0] = cx; CP[1] = cy; CP[2] = cz; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); CP[0] = ax + acx * w; CP[1] = ay + acy * w; CP[2] = az + acz * w; return; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); CP[0] = bx + (cx - bx) * w; CP[1] = by + (cy - by) * w; CP[2] = bz + (cz - bz) * w; return; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  CP[0] = ax + abx * v + acx * w; CP[1] = ay + aby * v + acy * w; CP[2] = az + abz * v + acz * w;
}

// ===================== MUNDO (grade uniforme de triângulos) =====================
class World {
  constructor(V, surf, cell) {
    this.V = V; this.surf = surf; const nT = this.nT = (V.length / 9) | 0; const cs = this.cs = cell || 16;
    const N = this.N = new Float32Array(nT * 3), Y = this.Y = new Float32Array(nT * 2);
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    for (let i = 0; i < nT; i++) {
      const o = i * 9;
      const e1x = V[o + 3] - V[o], e1y = V[o + 4] - V[o + 1], e1z = V[o + 5] - V[o + 2];
      const e2x = V[o + 6] - V[o], e2y = V[o + 7] - V[o + 1], e2z = V[o + 8] - V[o + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { N[i * 3 + 1] = 1; } else { N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l; }
      Y[i * 2] = Math.min(V[o + 1], V[o + 4], V[o + 7]); Y[i * 2 + 1] = Math.max(V[o + 1], V[o + 4], V[o + 7]);
      for (let k = 0; k < 3; k++) { const x = V[o + k * 3], z = V[o + k * 3 + 2]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z; }
    }
    this.minx = minx - 1; this.minz = minz - 1; this.gx = Math.ceil((maxx - minx + 2) / cs) + 1; this.gz = Math.ceil((maxz - minz + 2) / cs) + 1;
    const nc = this.gx * this.gz, start = this.start = new Int32Array(nc + 1);
    const rng = (i) => {
      const o = i * 9; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < 3; k++) { const x = V[o + k * 3], z = V[o + k * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
      return [Math.floor((x0 - this.minx) / cs), Math.floor((x1 - this.minx) / cs), Math.floor((z0 - this.minz) / cs), Math.floor((z1 - this.minz) / cs)];
    };
    const gx = this.gx;
    for (let i = 0; i < nT; i++) { const r = rng(i); for (let z = r[2]; z <= r[3]; z++) for (let x = r[0]; x <= r[1]; x++) start[z * gx + x + 1]++; }
    for (let i = 0; i < nc; i++) start[i + 1] += start[i];
    const fill = new Int32Array(start.subarray(0, nc)), list = this.list = new Int32Array(start[nc]);
    for (let i = 0; i < nT; i++) { const r = rng(i); for (let z = r[2]; z <= r[3]; z++) for (let x = r[0]; x <= r[1]; x++) list[fill[z * gx + x]++] = i; }
    this.stamp = new Uint32Array(nT); this.sc = 1;
    this.hit = { t: 0, nx: 0, ny: 1, nz: 0, tri: -1 };
    this.cn = new Float64Array(7 * 8); // contatos de esfera: nx,ny,nz,prof,px,py,pz
    this.cnCount = 0;
  }
  _rayCell(ci, ox, oy, oz, dx, dy, dz, maxT, minNy) {
    const V = this.V, N = this.N, Y = this.Y, list = this.list, h = this.hit, st = this.stamp, sc = this.sc;
    const y1 = oy + dy * maxT, ylo = Math.min(oy, y1) - 0.01, yhi = Math.max(oy, y1) + 0.01;
    for (let k = this.start[ci], e = this.start[ci + 1]; k < e; k++) {
      const i = list[k]; if (st[i] === sc) continue; st[i] = sc;
      if (Y[i * 2 + 1] < ylo || Y[i * 2] > yhi) continue;
      const o = i * 9, ax = V[o], ay = V[o + 1], az = V[o + 2];
      const e1x = V[o + 3] - ax, e1y = V[o + 4] - ay, e1z = V[o + 5] - az, e2x = V[o + 6] - ax, e2y = V[o + 7] - ay, e2z = V[o + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t < 0 || t > maxT || t >= h.t) continue;
      let nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      if (nx * dx + ny * dy + nz * dz > 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (ny < minNy) continue;
      h.t = t; h.nx = nx; h.ny = ny; h.nz = nz; h.tri = i;
    }
  }
  // raio (direção normalizada). Retorna true e preenche this.hit
  raycast(ox, oy, oz, dx, dy, dz, maxT, minNy) {
    this.sc++; if (this.sc > 4294967000) { this.stamp.fill(0); this.sc = 1; }
    const h = this.hit; h.t = maxT + 1; h.tri = -1; const cs = this.cs, gx = this.gx, gz = this.gz;
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    let ix = Math.floor((ox - this.minx) / cs), iz = Math.floor((oz - this.minz) / cs);
    const ixE = Math.floor((ex - this.minx) / cs), izE = Math.floor((ez - this.minz) / cs);
    if (ix === ixE && iz === izE) { if (ix >= 0 && iz >= 0 && ix < gx && iz < gz) this._rayCell(iz * gx + ix, ox, oy, oz, dx, dy, dz, maxT, minNy); return h.tri >= 0; }
    const sx = ex > ox ? 1 : -1, sz = ez > oz ? 1 : -1, ddx = ex - ox, ddz = ez - oz;
    const nxb = (ix + (sx > 0 ? 1 : 0)) * cs + this.minx, nzb = (iz + (sz > 0 ? 1 : 0)) * cs + this.minz;
    let tMx = ddx !== 0 ? (nxb - ox) / ddx : 1e30, tMz = ddz !== 0 ? (nzb - oz) / ddz : 1e30;
    const tDx = ddx !== 0 ? (cs * sx) / ddx : 1e30, tDz = ddz !== 0 ? (cs * sz) / ddz : 1e30;
    for (let n = 0; n < 400; n++) {
      if (ix >= 0 && iz >= 0 && ix < gx && iz < gz) this._rayCell(iz * gx + ix, ox, oy, oz, dx, dy, dz, maxT, minNy);
      if (h.tri >= 0 && h.t / maxT <= Math.min(tMx, tMz)) break;
      if (tMx < tMz) { if (tMx > 1) break; ix += sx; tMx += tDx; } else { if (tMz > 1) break; iz += sz; tMz += tDz; }
      if (ix === ixE && iz === izE) { if (ix >= 0 && iz >= 0 && ix < gx && iz < gz) this._rayCell(iz * gx + ix, ox, oy, oz, dx, dy, dz, maxT, minNy); break; }
    }
    return h.tri >= 0;
  }
  // contatos esfera x triângulos. maxNy: ignora contatos cuja normal tem y > maxNy (p/ esferas de roda)
  sphere(cx, cy, cz, r, maxNy) {
    this.sc++; const V = this.V, N = this.N, Y = this.Y, list = this.list, st = this.stamp, sc = this.sc, cs = this.cs, gx = this.gx, gz = this.gz, cn = this.cn;
    let n = 0; const r2 = r * r;
    const x0 = Math.max(0, Math.floor((cx - r - this.minx) / cs)), x1 = Math.min(gx - 1, Math.floor((cx + r - this.minx) / cs));
    const z0 = Math.max(0, Math.floor((cz - r - this.minz) / cs)), z1 = Math.min(gz - 1, Math.floor((cz + r - this.minz) / cs));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const ci = z * gx + x;
      for (let k = this.start[ci], e = this.start[ci + 1]; k < e; k++) {
        const i = list[k]; if (st[i] === sc) continue; st[i] = sc;
        if (Y[i * 2 + 1] < cy - r || Y[i * 2] > cy + r) continue;
        const o = i * 9, nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
        const pd = (cx - V[o]) * nx + (cy - V[o + 1]) * ny + (cz - V[o + 2]) * nz; if (pd > r || pd < -r) continue;
        closestPtTri(cx, cy, cz, V[o], V[o + 1], V[o + 2], V[o + 3], V[o + 4], V[o + 5], V[o + 6], V[o + 7], V[o + 8]);
        const qx = cx - CP[0], qy = cy - CP[1], qz = cz - CP[2], d2 = qx * qx + qy * qy + qz * qz; if (d2 >= r2) continue;
        let d = Math.sqrt(d2), ux, uy, uz;
        if (d > 1e-6) { ux = qx / d; uy = qy / d; uz = qz / d; } else { const s = pd >= 0 ? 1 : -1; ux = nx * s; uy = ny * s; uz = nz * s; }
        if (maxNy !== undefined && uy > maxNy) continue;
        const depth = r - d; let slot = -1;
        if (n < 8) slot = n++; else { let mn = 1e9, mi = 0; for (let j = 0; j < 8; j++) if (cn[j * 7 + 3] < mn) { mn = cn[j * 7 + 3]; mi = j; } if (depth > mn) slot = mi; }
        if (slot >= 0) { const b = slot * 7; cn[b] = ux; cn[b + 1] = uy; cn[b + 2] = uz; cn[b + 3] = depth; cn[b + 4] = CP[0]; cn[b + 5] = CP[1]; cn[b + 6] = CP[2]; }
      }
    }
    this.cnCount = n; return n;
  }
  surfAt(tri) { return tri >= 0 ? this.surf[tri] : 0; }
}

// ===================== VEÍCULO =====================
// Eixos locais: +X esquerda, +Y cima, +Z frente (iguais ao modelo do carro).
const SURF_GRIP = [1.0, 1.0, 0.62, 0.72]; // 0 outro, 1 asfalto, 2 grama, 3 terra/areia/rocha
const GEARS = [0, 3.55, 2.30, 1.66, 1.28, 1.00, 0.80], FINAL = 3.46, REV = 3.4;
// Escala do carro em relação ao modelo original (4,49 m). 1 = tamanho original. Tudo (render, rodas, colisão, câmera) deriva deste valor.
const CAR_SCALE = 1.2;
function torqueCurve(rpm) { // N·m (motor ~ 3,2 L aspirado, ~ 340 cv)
  const x = rpm / 1000; if (x < 1) return 150 * x; // idle
  const t = x < 4.8 ? 250 + 120 * Math.sin((x - 1) / 3.8 * PI * 0.5) : 370 - Math.max(0, (x - 6.2)) * 90;
  return Math.max(60, x > 8 ? 0 : t) ;
}
class Vehicle {
  constructor(world, opt) {
    opt = opt || {}; this.world = world;
    const S = opt.scale || CAR_SCALE, op = opt.params || {}, mk = (op.mass || 1500) / 1500; this.mk = mk;
    // Dimensões em metros escaladas por S. Marchas/freios/inércia são ajustados para o desempenho continuar igual ao do carro original.
    const P = this.P = Object.assign({
      scale: S, mass: 1500, Ix: 2736 * S * S * mk, Iy: 2944 * S * S * mk, Iz: 900 * S * S * mk, hCom: null, anchorY: 0.09 * S, L0: 0.40 * S, dMin: 0.05 * S, bumpZ: 0.12 * S, stepH: 0.36 * S, stepUpMin: 1.0, stepUpMax: 2.6,
      k: 46000 * mk, cBump: 2900 * mk, cReb: 4300 * mk, kArb: 17000 * mk, wr: 0.321 * S, Iw: 1.5 * S * S * mk, mu: 1.3, brakeT: 3200 * S * mk, hbT: 4200 * S * mk, steerMax: 0.58,
      cdA: 0.68, clA: 0.35, tx: 0.749 * S, tz: 1.311 * S, eff: 0.88, B: 11.0, C: 1.45, E: 0.0, final: FINAL * S,
      // trem de força e extras por carro (tudo pode ser sobrescrito em assets/cars/cars.json -> params)
      awd: false, offroad: 1, vMax: 0, gears: GEARS, rev: REV, idle: 950, rpmMax: 8200, rpmCut: 7900, launch: 3600, launchEnd: 3200, shiftUp: [4600, 2300], shiftDn: [2300, 1900], torque: null, bumpK: 90000 * mk,
    }, op);
    if (op.hCom === undefined) P.hCom = P.wr - P.anchorY + P.L0 - 0.082; // roda encostando no chão com a mola em repouso
    if (P.torque) { const T = P.torque; P.torqueFn = (rpm) => { if (rpm <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (rpm <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (rpm - a[0]) / (b[0] - a[0]); } return 0; }; } else P.torqueFn = torqueCurve;
    this.p = [0, 5, 0]; this.q = [0, 0, 0, 1]; this.R = new Float64Array(9); this.v = [0, 0, 0]; this.w = [0, 0, 0];
    this.wheels = [];
    const tx = P.tx, tz = P.tz;
    [[tx, tz, 1, 0], [-tx, tz, 1, 0], [tx, -tz, 0, 1], [-tx, -tz, 0, 1]].forEach((a, i) => this.wheels.push({
      ax: a[0], ay: P.anchorY, az: a[1], steer: !!a[2], drive: P.awd ? true : !!a[3], d: P.L0 - 0.082, dPrev: P.L0 - 0.082, c: 0, ground: false, om: 0, spin: 0, steerA: 0,
      nx: 0, ny: 1, nz: 0, Fz: 0, slip: 0, slipRatio: 0, surf: 0, px: 0, py: 0, pz: 0, sprF: 0, skid: 0,
    }));
    // esferas de colisão do chassi (x,y,z locais, raio) e esferas das rodas (só paredes)
    this.spheres = [];
    for (const z of [-1.8, -0.9, 0, 0.9, 1.8]) for (const x of [-0.55, 0.55]) this.spheres.push([x * S, 0.05 * S, z * S, 0.38 * S]);
    this.spheres.push([0, 0.1 * S, 1.25 * S, 0.4 * S], [0, 0.1 * S, -1.25 * S, 0.4 * S], [0, 0.42 * S, -0.5 * S, 0.38 * S], [0, 0.42 * S, 0.55 * S, 0.38 * S]);
    this.invM = 1 / P.mass;
    this.gear = 1; this.rpm = 900; this.shiftT = 0; this.shiftCut = 0; this.throttle = 0; this.brake = 0; this.hb = 0; this.steerIn = 0; this.steerA = 0;
    this.impact = 0; this.speed = 0; this.fwdSpeed = 0; this.onGround = 0; this.inWater = 0; this.safe = null; this.safeT = 0; this.airT = 0; this.flipT = 0; this.stuckT = 0;
    this.yawRate = 0; this.slipAngle = 0; this.drifting = 0; this.absOn = true; this.tcs = true; this.noInputT = 0; this.time = 0;
    this.updateR();
  }
  updateR() {
    const [x, y, z, w] = this.q, R = this.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
  }
  place(x, y, z, yaw) {
    this.p = [x, y, z]; this.q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]; this.v = [0, 0, 0]; this.w = [0, 0, 0];
    this.updateR(); this.gear = 1; this.rpm = 900; for (const W of this.wheels) { W.om = 0; W.d = this.P.L0 - 0.082; W.dPrev = W.d; } this.safe = { x, y, z, yaw };
  }
  get yaw() { return Math.atan2(this.R[2], this.R[8]); }
  // vetor local -> mundo
  l2w(x, y, z, o) { const R = this.R; o[0] = R[0] * x + R[1] * y + R[2] * z; o[1] = R[3] * x + R[4] * y + R[5] * z; o[2] = R[6] * x + R[7] * y + R[8] * z; }
  respawn(toSafe) {
    const s = this.safe || { x: this.p[0], y: this.p[1], z: this.p[2], yaw: this.yaw };
    const yaw = toSafe ? s.yaw : this.yaw, x = toSafe ? s.x : this.p[0], y = (toSafe ? s.y : this.p[1]) + 1.3, z = toSafe ? s.z : this.p[2];
    const keep = this.safe; this.place(x, y, z, yaw); this.safe = keep; this.flipT = 0; this.inWater = 0; this.stuckT = 0;
  }

  step(dt, inp) {
    const P = this.P, W = this.wheels, wd = this.world, R = this.R, p = this.p, v = this.v, w = this.w; this.time += dt;
    this.updateR();
    // ---- entradas ----
    const spd = Math.hypot(v[0], v[1], v[2]);
    let ux = R[1], uy = R[4], uz = R[7]; // eixo "cima" do chassi
    let fx = R[2], fy = R[5], fz = R[8];  // frente
    const fwdSpeed = v[0] * fx + v[1] * fy + v[2] * fz; this.fwdSpeed = fwdSpeed; this.speed = spd;
    this.throttle = inp.throttle; this.brake = inp.brake; this.hb = inp.hb;
    // marcha à ré automática
    if (this.gear > 0 && inp.brake > 0.1 && inp.throttle < 0.1 && fwdSpeed < 1.2) this.gear = -1;
    else if (this.gear < 0 && inp.throttle > 0.1 && inp.brake < 0.1 && fwdSpeed > -1.2) { this.gear = 1; }
    const rev = this.gear < 0;
    const driveIn = rev ? inp.brake : inp.throttle, brakeIn = rev ? inp.throttle : inp.brake;
    // ---- direção (limite por velocidade + folga para contra-esterço) ----
    const vl = Math.hypot(v[0] - uy * 0 , v[2]) ; // velocidade horizontal aprox
    const lat = v[0] * R[0] + v[1] * R[3] + v[2] * R[6];
    const beta = Math.atan2(lat, Math.max(Math.abs(fwdSpeed), 1.5)); this.slipAngle = beta;
    const L = 2 * P.tz, vv = Math.max(spd, 3);
    const dmax = clamp(L * 15 / (vv * vv) + 0.9 * Math.abs(beta) * (fwdSpeed > 0 ? 1 : 0), 0.035, P.steerMax);
    const target = -clamp(inp.steer, -1, 1) * dmax;
    const rate = 5.0 * dt; this.steerA += clamp(target - this.steerA, -rate, rate);
    // ---- gravidade ----
    let Fx = 0, Fy = -9.81 * P.mass, Fz = 0, Tx = 0, Ty = 0, Tz = 0;
    // ---- passada 1: raios ----
    let grounded = 0;
    for (let i = 0; i < 4; i++) {
      const wh = W[i]; wh.dPrev = wh.d;
      const axw = R[0] * wh.ax + R[1] * wh.ay + R[2] * wh.az + p[0], ayw = R[3] * wh.ax + R[4] * wh.ay + R[5] * wh.az + p[1], azw = R[6] * wh.ax + R[7] * wh.ay + R[8] * wh.az + p[2];
      wh.axw = axw; wh.ayw = ayw; wh.azw = azw;
      const maxT = P.L0 + P.wr;
      if (wd.raycast(axw, ayw, azw, -ux, -uy, -uz, maxT, 0.35)) {
        const h = wd.hit; wh.ground = true; wh.nx = h.nx; wh.ny = h.ny; wh.nz = h.nz;
        wh.d = clamp(h.t - P.wr, P.dMin, P.L0); wh.hitT = h.t; wh.surf = wd.surf[h.tri];
        wh.px = axw - ux * h.t; wh.py = ayw - uy * h.t; wh.pz = azw - uz * h.t; wh.c = P.L0 - wh.d; grounded++;
        if (h.t - P.wr < P.dMin) wh.c = P.L0 - (h.t - P.wr); // bump stop mais fundo
      } else { wh.ground = false; wh.d = Math.min(P.L0, wh.d + 2.5 * dt); wh.c = P.L0 - wh.d; }
    }
    this.onGround = grounded; this.airT = grounded ? 0 : this.airT + dt;
    // ---- motor / câmbio ----
    let wSum = 0, nD = 0; for (const wh of W) if (wh.drive) { wSum += wh.om; nD++; } const wRear = wSum / nD; const ratio = rev ? P.rev : P.gears[this.gear] || 1;
    const wheelRpm = Math.abs(wRear) * ratio * P.final * 60 / TAU;
    let rpm = Math.max(wheelRpm, P.idle);
    if (wheelRpm < P.launchEnd && driveIn > 0.05) rpm = Math.max(rpm, P.idle + driveIn * P.launch * Math.min(1, 1.2 - wheelRpm / P.launchEnd + 0.4)); // embreagem patinando na saída
    rpm = Math.min(rpm, P.rpmMax); this.rpm += (rpm - this.rpm) * Math.min(1, 14 * dt);
    this.shiftCut = Math.max(0, this.shiftCut - dt); this.shiftT = Math.max(0, this.shiftT - dt);
    if (!rev && this.shiftT <= 0) {
      const up = P.shiftUp[0] + P.shiftUp[1] * driveIn, dn = P.shiftDn[0] + P.shiftDn[1] * driveIn;
      if (this.gear < P.gears.length - 1 && wheelRpm > up) { this.gear++; this.shiftT = 0.45; this.shiftCut = 0.12; }
      else if (this.gear > 1 && wheelRpm < dn && !(this.hb > 0.5)) { this.gear--; this.shiftT = 0.35; }
    }
    let eT = driveIn * P.torqueFn(rpm) * (rpm > P.rpmCut ? 0 : 1) * (this.shiftCut > 0 ? 0 : 1) * (P.vMax ? clamp((P.vMax - Math.abs(fwdSpeed)) / 3, 0, 1) : 1);
    if (driveIn < 0.05) eT = -50 * this.mk * (rpm / 6000); // freio-motor
    const wheelT = eT * ratio * P.final * P.eff * (rev ? -1 : 1) / nD; // dividido entre as rodas motrizes (diferencial travado)
    // ---- passada 2: forças ----
    const arbF = [P.kArb * (W[0].c - W[1].c), -P.kArb * (W[0].c - W[1].c), P.kArb * (W[2].c - W[3].c), -P.kArb * (W[2].c - W[3].c)];
    let maxSlip = 0;
    for (let i = 0; i < 4; i++) {
      const wh = W[i];
      // posição visual da roda
      if (!wh.ground) {
        wh.Fz = 0; wh.slip = 0; wh.skid *= 0.9;
        // roda no ar: freios param, motor acelera
        let om = wh.om; if (wh.drive) om += (wheelT / P.Iw) * dt; om *= (1 - 0.4 * dt);
        if (brakeIn > 0.1 || (wh.drive && this.hb > 0.5)) om *= (1 - 8 * dt); wh.om = om; wh.spin += om * dt; continue;
      }
      const cv = (wh.dPrev - wh.d) / dt; // velocidade de compressão (m/s)
      let sf = P.k * wh.c + (cv > 0 ? P.cBump : P.cReb) * cv + arbF[i];
      if (wh.d < P.bumpZ) sf += P.bumpK * (P.bumpZ - wh.d);
      if (sf < 0) sf = 0; wh.Fz = sf; wh.sprF = sf;
      const nx = wh.nx, ny = wh.ny, nz = wh.nz;
      // vetor posição do contato relativo ao CM
      const rx = wh.px - p[0], ry = wh.py - p[1], rz = wh.pz - p[2];
      const vcx = v[0] + w[1] * rz - w[2] * ry, vcy = v[1] + w[2] * rx - w[0] * rz, vcz = v[2] + w[0] * ry - w[1] * rx;
      // direção "frente" da roda (esterçada) projetada no plano do solo
      let a = wh.steer ? this.steerA : 0; const sa = Math.sin(a), ca = Math.cos(a);
      let fwx = R[0] * sa + R[2] * ca, fwy = R[3] * sa + R[5] * ca, fwz = R[6] * sa + R[8] * ca; const dn = fwx * nx + fwy * ny + fwz * nz;
      fwx -= nx * dn; fwy -= ny * dn; fwz -= nz * dn; const fl = Math.hypot(fwx, fwy, fwz) || 1; fwx /= fl; fwy /= fl; fwz /= fl;
      const lx = ny * fwz - nz * fwy, ly = nz * fwx - nx * fwz, lz = nx * fwy - ny * fwx; // esquerda = n x f
      const vlong = vcx * fwx + vcy * fwy + vcz * fwz, vlat = vcx * lx + vcy * ly + vcz * lz;
      const grip = P.mu * SURF_GRIP[wh.surf] * (wh.surf >= 2 ? P.offroad : 1);
      // freios / freio de mão (ABS limita o torque ao que o pneu aguenta)
      let Tb = 0; const isRear = !wh.steer;
      const brkBias = isRear ? 0.4 : 0.6;
      let brkT = brakeIn * P.brakeT * brkBias;
      if (this.absOn && wh.slipRatio < 0) brkT *= clamp(1 - (-wh.slipRatio - 0.14) * 14, 0.04, 1);
      Tb = brkT;
      const hbOn = isRear && this.hb > 0.5; if (hbOn) Tb = Math.max(Tb, P.hbT);
      let Td = wh.drive ? wheelT : 0;
      if (this.tcs && Td > 0 && wh.slipRatio > 0.2 && !hbOn) Td *= clamp(1 - (wh.slipRatio - 0.2) * 1.5, 0.35, 1);
      const vref = Math.max(Math.abs(vlong), 2.8);
      let sx = wh.om * P.wr - vlong, sy = -vlat;
      const sigx = sx / vref, sigy = sy / vref * 0.92;
      let sig = Math.hypot(sigx, sigy); const B = P.B, C = P.C;
      const f = Math.sin(C * Math.atan(B * sig));
      const fm = grip * sf * f; let Fl = 0, Ft = 0, cth2 = 1;
      if (sig > 1e-6) { Fl = fm * sigx / sig; Ft = fm * sigy / sig; cth2 = sigx * sigx / (sig * sig); }
      maxSlip = Math.max(maxSlip, sig); wh.slip = sig; wh.slipRatio = sigx;
      const f2 = Math.sin(C * Math.atan(B * (sig + 0.02))), dfd = Math.max((f2 - f) / 0.02, 0.03 * B * C);
      const K = grip * sf / vref * (dfd * cth2 + (sig > 1e-6 ? f / sig : B * C) * (1 - cth2));
      // atualização implícita da velocidade angular da roda
      let dOm = (Td - P.wr * Fl) / (P.Iw / dt + K * P.wr * P.wr);
      let om1 = wh.om + dOm; Fl += K * P.wr * dOm;
      // aplica freio sem inverter o sinal
      if (Tb > 0) { const dB = Tb / P.Iw * dt; if (Math.abs(om1) <= dB) om1 = 0; else om1 -= sign(om1) * dB; }
      // resistência de rolamento
      Fl -= 0.012 * sf * Math.tanh(vlong * 2);
      wh.om = om1; wh.spin += om1 * dt;
      wh.skid = Math.min(1, Math.max(0, (sig - 0.28) * 2.2));
      // força total no solo
      const Fnx = nx * sf + fwx * Fl + lx * Ft, Fny = ny * sf + fwy * Fl + ly * Ft, Fnz = nz * sf + fwz * Fl + lz * Ft;
      Fx += Fnx; Fy += Fny; Fz += Fnz;
      Tx += ry * Fnz - rz * Fny; Ty += rz * Fnx - rx * Fnz; Tz += rx * Fny - ry * Fnx;
    }
    // ---- aerodinâmica ----
    const dragK = 0.5 * 1.2 * P.cdA * spd; Fx -= dragK * v[0]; Fy -= dragK * v[1]; Fz -= dragK * v[2];
    const down = 0.5 * 1.2 * P.clA * spd * spd; Fx -= ux * down; Fy -= uy * down; Fz -= uz * down;
    // ---- água ----
    this.inWater = p[1] < 0.15 && grounded < 2 ? this.inWater + dt : (p[1] < -0.5 ? this.inWater + dt : 0);
    if (this.inWater > 0) { const dk = 4000 * Math.min(1, this.inWater * 2); Fx -= dk * v[0]; Fy -= dk * v[1] * 0.5; Fz -= dk * v[2]; }
    // ---- integração ----
    const im = this.invM;
    v[0] += Fx * im * dt; v[1] += Fy * im * dt; v[2] += Fz * im * dt;
    // I^-1 mundo * torque
    const wx = Tx, wy = Ty, wz = Tz;
    const lx_ = R[0] * wx + R[3] * wy + R[6] * wz, ly_ = R[1] * wx + R[4] * wy + R[7] * wz, lz_ = R[2] * wx + R[5] * wy + R[8] * wz;
    const ax_ = lx_ / P.Ix, ay_ = ly_ / P.Iy, az_ = lz_ / P.Iz;
    w[0] += (R[0] * ax_ + R[1] * ay_ + R[2] * az_) * dt; w[1] += (R[3] * ax_ + R[4] * ay_ + R[5] * az_) * dt; w[2] += (R[6] * ax_ + R[7] * ay_ + R[8] * az_) * dt;
    const ad = 1 - 0.25 * dt; w[0] *= ad; w[1] *= ad; w[2] *= ad; // amortecimento angular leve
    p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
    const q = this.q, hq = 0.5 * dt;
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    q[0] = qx + hq * (w[0] * qw + w[1] * qz - w[2] * qy); q[1] = qy + hq * (w[1] * qw + w[2] * qx - w[0] * qz);
    q[2] = qz + hq * (w[2] * qw + w[0] * qy - w[1] * qx); q[3] = qw + hq * (-w[0] * qx - w[1] * qy - w[2] * qz);
    const ql = 1 / Math.hypot(q[0], q[1], q[2], q[3]); q[0] *= ql; q[1] *= ql; q[2] *= ql; q[3] *= ql; this.updateR();
    this.collide(dt);
    // ---- auxiliares ----
    this.yawRate = w[1];
    this.drifting = Math.abs(beta) > 0.28 && spd > 7 ? 1 : 0;
    this.maxSlip = maxSlip;
    const up = R[4]; this.flipT = up < 0.25 && spd < 6 ? this.flipT + dt : 0;
    if (!isFinite(p[0] + p[1] + p[2] + v[0] + v[1] + v[2])) this.respawn(true);
    if (grounded >= 3 && up > 0.85 && spd > 1 && p[1] > 0.6 && W[0].surf !== 2) { this.safeT += dt; if (this.safeT > 0.6) { this.safe = { x: p[0], y: p[1], z: p[2], yaw: this.yaw }; this.safeT = 0; } }
  }

  // o contato de roda cn[b..] (normal para fora do obstáculo) é um degrau baixo com topo plano? (calçada, lombada, etc.)
  isStep(cn, b, wheelBottom) {
    const nx = cn[b], nz = cn[b + 2], hl = Math.hypot(nx, nz); if (hl < 0.5) return false;
    const hx = nx / hl, hz = nz / hl, P = this.P, wd = this.world, y0 = wheelBottom + P.stepH + 0.1;
    for (const dd of [0.1, 0.4]) {
      const qx = cn[b + 4] - hx * dd, qz = cn[b + 6] - hz * dd;
      if (!wd.raycast(qx, y0, qz, 0, -1, 0, P.stepH + 0.25, 0.7)) return false;
      const top = y0 - wd.hit.t - wheelBottom; if (top > P.stepH || top < -0.1) return false;
    }
    return true;
  }
  collide(dt) {
    const wd = this.world, R = this.R, p = this.p, v = this.v, w = this.w, P = this.P, im = this.invM, cn = wd.cn;
    const Ixy = [P.Ix, P.Iy, P.Iz], list = this.spheres, C = this._C || (this._C = new Float64Array(64 * 9)), JA = this._JA || (this._JA = new Float64Array(64));
    let nc = 0, px = 0, py = 0, pz = 0, stepN = 0, stepNx = 0, stepNz = 0;
    for (let si = 0; si < list.length + 4 && nc < 60; si++) {
      let lx, ly, lz, r, maxNy;
      if (si < list.length) { const s = list[si]; lx = s[0]; ly = s[1]; lz = s[2]; r = s[3]; maxNy = undefined; }
      else { const wh = this.wheels[si - list.length]; lx = wh.ax; ly = wh.ay - wh.d; lz = wh.az; r = P.wr; maxNy = 0.45; }
      const cx = R[0] * lx + R[1] * ly + R[2] * lz + p[0], cy = R[3] * lx + R[4] * ly + R[5] * lz + p[1], cz = R[6] * lx + R[7] * ly + R[8] * lz + p[2];
      const n = wd.sphere(cx, cy, cz, r, maxNy);
      for (let k = 0; k < n && nc < 60; k++) {
        const b = k * 7, o = nc * 9;
        // degrau/quina de calçada: contato baixo da roda contra algo com topo plano baixo não é parede, a roda sobe nele
        if (maxNy !== undefined && this.isStep(cn, b, cy - r)) { stepN = cn[b] * cn[b] + cn[b + 2] * cn[b + 2] > 1e-4 ? Math.max(stepN, 1) : stepN; stepNx = cn[b]; stepNz = cn[b + 2]; continue; } C[o] = cn[b]; C[o + 1] = cn[b + 1]; C[o + 2] = cn[b + 2]; C[o + 3] = cn[b + 3];
        C[o + 4] = cn[b + 4] - p[0]; C[o + 5] = cn[b + 5] - p[1]; C[o + 6] = cn[b + 6] - p[2]; C[o + 7] = 0; JA[nc] = 0;
        const pu = Math.min(cn[b + 3], 0.25); px += cn[b] * pu; py += cn[b + 1] * pu; pz += cn[b + 2] * pu; nc++;
      }
    }
    if (stepN) { // sobe o degrau: velocidade vertical proporcional à velocidade com que a roda empurra a quina
      const hl = Math.hypot(stepNx, stepNz) || 1, into = Math.max(0, -(v[0] * stepNx + v[2] * stepNz) / hl);
      const up = clamp(0.9 * into + 0.9, P.stepUpMin, P.stepUpMax); if (v[1] < up) v[1] = up;
    }
    if (!nc) return;
    const sc = 0.6 / Math.max(1, nc * 0.5); p[0] += px * sc; p[1] += py * sc; p[2] += pz * sc;
    // alvo de restituição calculado antes das iterações
    for (let c = 0; c < nc; c++) {
      const o = c * 9, nx = C[o], ny = C[o + 1], nz = C[o + 2], rx = C[o + 4], ry = C[o + 5], rz = C[o + 6];
      const vn = (v[0] + w[1] * rz - w[2] * ry) * nx + (v[1] + w[2] * rx - w[0] * rz) * ny + (v[2] + w[0] * ry - w[1] * rx) * nz;
      C[o + 7] = vn < -3 ? -0.18 * vn : 0; if (-vn > this.impact) this.impact = -vn;
    }
    for (let it = 0; it < 6; it++) for (let c = 0; c < nc; c++) {
      const o = c * 9, nx = C[o], ny = C[o + 1], nz = C[o + 2], rx = C[o + 4], ry = C[o + 5], rz = C[o + 6];
      const vx = v[0] + w[1] * rz - w[2] * ry, vy = v[1] + w[2] * rx - w[0] * rz, vz = v[2] + w[0] * ry - w[1] * rx;
      const vn = vx * nx + vy * ny + vz * nz;
      const k1 = this.invInertiaApply(ry * nz - rz * ny, rz * nx - rx * nz, rx * ny - ry * nx, Ixy);
      const kn = im + (k1[1] * rz - k1[2] * ry) * nx + (k1[2] * rx - k1[0] * rz) * ny + (k1[0] * ry - k1[1] * rx) * nz;
      let j = (C[o + 7] - vn) / kn; const old = JA[c]; JA[c] = Math.max(0, old + j); j = JA[c] - old;
      if (j !== 0) { v[0] += nx * j * im; v[1] += ny * j * im; v[2] += nz * j * im; w[0] += k1[0] * j; w[1] += k1[1] * j; w[2] += k1[2] * j; }
      // atrito de Coulomb
      const vx2 = v[0] + w[1] * rz - w[2] * ry, vy2 = v[1] + w[2] * rx - w[0] * rz, vz2 = v[2] + w[0] * ry - w[1] * rx, vn2 = vx2 * nx + vy2 * ny + vz2 * nz;
      const tx = vx2 - nx * vn2, ty = vy2 - ny * vn2, tz = vz2 - nz * vn2, tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-4 && JA[c] > 0) {
        const dx = tx / tl, dy = ty / tl, dz = tz / tl;
        const k2 = this.invInertiaApply(ry * dz - rz * dy, rz * dx - rx * dz, rx * dy - ry * dx, Ixy);
        const kt = im + (k2[1] * rz - k2[2] * ry) * dx + (k2[2] * rx - k2[0] * rz) * dy + (k2[0] * ry - k2[1] * rx) * dz;
        const jt = Math.min(tl / kt, 0.3 * JA[c]);
        v[0] -= dx * jt * im; v[1] -= dy * jt * im; v[2] -= dz * jt * im; w[0] -= k2[0] * jt; w[1] -= k2[1] * jt; w[2] -= k2[2] * jt;
      }
    }
    this.updateR();
  }
  // retorna I^-1 * x (mundo) usando I diagonal no corpo
  invInertiaApply(x, y, z, I) {
    const R = this.R, o = this._ia || (this._ia = [0, 0, 0]);
    const lx = (R[0] * x + R[3] * y + R[6] * z) / I[0], ly = (R[1] * x + R[4] * y + R[7] * z) / I[1], lz = (R[2] * x + R[5] * y + R[8] * z) / I[2];
    o[0] = R[0] * lx + R[1] * ly + R[2] * lz; o[1] = R[3] * lx + R[4] * ly + R[5] * lz; o[2] = R[6] * lx + R[7] * ly + R[8] * lz; return o;
  }
}

// ===== decodifica o mapa empacotado em triângulos de colisão =====
const COLLIDE_CATS = { Street: 1, Buildings: 1, Opaque: 1, Misc: 1 };
function surfFromUV(u, v) {
  const cx = ((Math.floor(u * 4) % 4) + 4) % 4, cy = ((Math.floor(v * 4) % 4) + 4) % 4;
  if ((cx === 1 && cy === 2) || (cx === 3 && cy === 0)) return 1;
  if ((cx === 0 && cy === 3) || (cx === 3 && cy === 3)) return 2;
  if ((cx === 1 && cy === 3) || (cx === 2 && cy === 3) || (cx === 2 && cy === 0) || (cx === 1 && cy === 1)) return 3;
  return 0;
}
function buildCollision(man, buf, props) {
  let nT = 0; for (const pr of man.prims) if (COLLIDE_CATS[pr.c]) nT += pr.ni / 3;
  const V = new Float32Array(nT * 9), surf = new Uint8Array(nT); let t = 0;
  for (const pr of man.prims) {
    if (!COLLIDE_CATS[pr.c]) continue;
    const pos = new Uint16Array(buf, pr.p, pr.n * 4), idx = pr.it === 2 ? new Uint16Array(buf, pr.i, pr.ni) : new Uint32Array(buf, pr.i, pr.ni);
    const bb = pr.bb, sx = (bb[3] - bb[0]) / 65535, sy = (bb[4] - bb[1]) / 65535, sz = (bb[5] - bb[2]) / 65535;
    const uv = pr.c === 'Street' ? new Uint16Array(buf, pr.u, pr.n * 2) : null, ub = pr.uvb;
    for (let i = 0; i < pr.ni; i += 3) {
      let su = 0, sv = 0;
      for (let k = 0; k < 3; k++) {
        const vi = idx[i + k], o = t * 9 + k * 3;
        V[o] = bb[0] + pos[vi * 4] * sx; V[o + 1] = bb[1] + pos[vi * 4 + 1] * sy; V[o + 2] = bb[2] + pos[vi * 4 + 2] * sz;
        if (uv) { su += ub[0] + uv[vi * 2] / 65535 * (ub[2] - ub[0]); sv += ub[1] + uv[vi * 2 + 1] / 65535 * (ub[3] - ub[1]); }
      }
      surf[t] = uv ? surfFromUV(su / 3, sv / 3) : 0; t++;
    }
  }
  if (props) { // postes e mastros: prismas finos de 6 lados (r = 0,22 m, 5 m de altura) para o carro bater
    const pts = [...props.lamps.map((l) => [l[0], l[1], l[2]]), ...props.sigs.map((l) => [l[0], l[1], l[2]])], K = 6, H = 5, r = 0.22, E = new Float32Array(pts.length * K * 18), ES = new Uint8Array(pts.length * K * 2); let o = 0;
    for (const q of pts) for (let k = 0; k < K; k++) {
      const a0 = k / K * TAU, a1 = (k + 1) / K * TAU, x0 = q[0] + Math.cos(a0) * r, z0 = q[2] + Math.sin(a0) * r, x1 = q[0] + Math.cos(a1) * r, z1 = q[2] + Math.sin(a1) * r, y0 = q[1], y1 = q[1] + H;
      E.set([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0], o); o += 18;
    }
    const V2 = new Float32Array(V.length + E.length); V2.set(V); V2.set(E, V.length); const s2 = new Uint8Array(surf.length + ES.length); s2.set(surf);
    return { V: V2, surf: s2 };
  }
  return { V, surf };
}
if (typeof module !== 'undefined') module.exports = { buildCollision, World, Vehicle, clamp, lerp, PI, TAU, SURF_GRIP, GEARS };
