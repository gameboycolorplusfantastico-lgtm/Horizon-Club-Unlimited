// ===================== CÂMERA ESTILO MIDNIGHT CLUB LOS ANGELES =====================
// Perseguição baixa e colada no carro: a câmera "arrasta" atrás nas curvas (mostra a lateral do carro),
// afasta e abre o FOV com a velocidade, olha para a frente da pista (carro fica no terço de baixo da tela),
// inclina levemente nas curvas e treme de leve em velocidade alta. Para voltar à câmera simples: Pausa > Estilo da câmera.
const CamMLC = (() => {
  const S = { yaw: 0, pos: [0, 0, 0], tgt: [0, 0, 0], roll: 0, fov: 1.05, ok: false, k: 0 };
  const dA = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const nz = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return {
    reset() { S.ok = false; },
    get speedFactor() { return S.k; },
    update(dt, veh, world, orbit) {
      const p = veh.p, cs = veh.P.scale, v = veh.v, sp = Math.hypot(v[0], v[2]), fs = veh.fwdSpeed, yaw = veh.yaw;
      const k = clamp(sp / 60, 0, 1); S.k = k;
      if (!S.ok) { S.yaw = yaw; S.pos = [p[0] - Math.sin(yaw) * 5 * cs, p[1] + 2 * cs, p[2] - Math.cos(yaw) * 5 * cs]; S.tgt = p.slice(); S.roll = 0; S.fov = 1.05; S.ok = true; }
      // direção da câmera: mistura frente do carro e direção do movimento (derrapando, a câmera mostra a lateral)
      let hd = yaw; if (sp > 3 && fs > 0) { const vh = Math.atan2(v[0], v[2]); hd = yaw + dA(vh, yaw) * clamp((sp - 3) / 10, 0, 0.8); }
      S.yaw += dA(hd, S.yaw) * (1 - Math.exp(-dt * (veh.drifting ? 1.8 : 3.0)));
      const a = 1 - Math.exp(-dt * 20), b = 1 - Math.exp(-dt * 10);
      S.tgt[0] += (p[0] - S.tgt[0]) * a; S.tgt[1] += (p[1] + 0.55 * cs - S.tgt[1]) * b; S.tgt[2] += (p[2] - S.tgt[2]) * a;
      const ya = S.yaw + orbit, sx = Math.sin(ya), cz = Math.cos(ya), tg = S.tgt;
      const dist = (5.0 + 1.5 * k) * cs, hh = (0.72 + 0.25 * k) * cs;
      const lat = clamp(veh.yawRate * 0.22 * Math.min(1, sp / 20), -0.55, 0.55) * cs; // sai para o lado de fora da curva
      const des = [tg[0] - sx * dist - cz * lat, tg[1] + hh, tg[2] - cz * dist + sx * lat];
      const dx = des[0] - tg[0], dy = des[1] - tg[1], dz = des[2] - tg[2], L = Math.hypot(dx, dy, dz);
      if (world.raycast(tg[0], tg[1], tg[2], dx / L, dy / L, dz / L, L + 0.4, -2)) { const t = Math.max(1.0, world.hit.t - 0.45); des[0] = tg[0] + dx / L * t; des[1] = tg[1] + dy / L * t + 0.1; des[2] = tg[2] + dz / L * t; }
      if (world.raycast(des[0], des[1] + 1.2, des[2], 0, -1, 0, 1.9, 0.2)) des[1] = Math.max(des[1], des[1] + 1.2 - world.hit.t + 0.55);
      const kx = 1 - Math.exp(-dt * (12 - 4 * k)), ky = 1 - Math.exp(-dt * 8);
      S.pos[0] += (des[0] - S.pos[0]) * kx; S.pos[1] += (des[1] - S.pos[1]) * ky; S.pos[2] += (des[2] - S.pos[2]) * kx;
      const pos = S.pos.slice();
      const ahead = (3.2 + sp * 0.12) * cs;                                    // olha para a frente da pista
      const look = [tg[0] + sx * ahead, tg[1] + 0.05 * cs, tg[2] + cz * ahead];
      const f = nz([look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]]);
      // inclinação (roll) nas curvas
      const rollT = clamp(veh.yawRate * 0.04 * Math.min(1, sp / 25), -0.07, 0.07); S.roll += (rollT - S.roll) * Math.min(1, 4 * dt);
      const r = nz([-f[2], 0, f[0]]); // direita = f x (0,1,0)
      let up = [0, 1, 0]; up = nz([up[0] - r[0] * S.roll, 1, up[2] - r[2] * S.roll]);
      // vibração em alta velocidade
      const vib = clamp((sp - 38) / 40, 0, 1) * 0.018 * cs; if (vib > 0) { pos[0] += (Math.random() - .5) * vib; pos[1] += (Math.random() - .5) * vib; pos[2] += (Math.random() - .5) * vib; }
      const fovT = 1.0 + 0.34 * k; S.fov += (fovT - S.fov) * Math.min(1, 2.5 * dt);
      return { pos, f, up, fov: S.fov, blur: clamp((sp - 22) / 48, 0, 1) };
    },
  };
})();
