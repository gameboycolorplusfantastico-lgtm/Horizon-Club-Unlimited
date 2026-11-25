// Auditoria: node tools/auditar_mundo.js  -> acha faixas de NPC e postes com problema (chao, parede, poste na pista, etc.)
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const { World, buildCollision } = require(root + '/src/core.js');
const man = JSON.parse(fs.readFileSync(root + '/assets/city.json')), b = fs.readFileSync(root + '/assets/city.wasm');
const { V, surf } = buildCollision(man, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); const w = new World(V, surf, 16);
const props = JSON.parse(fs.readFileSync(root + '/assets/props.json')), tj = JSON.parse(fs.readFileSync(root + '/assets/traffic.json'));
const ctx = { console: { log() {} }, Math, Float64Array, Float32Array, Map, Object, Array, Number, String, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(root + '/src/mods/traffic.js', 'utf8') + '\n;this.Traffic=Traffic;', ctx); const T = ctx.Traffic; T.build(tj, props);
const gy = (x, y, z, up) => w.raycast(x, y + up, z, 0, -1, 0, up + 12, -2) ? y + up - w.hit.t : null;
const out = { lanes: {}, lamps: {} }, add = (k, id, d) => { (out[k.split('.')[0]][k.split('.')[1]] = out[k.split('.')[0]][k.split('.')[1]] || []).push([id, d]); };
// ---- faixas ----
for (const L of T.lanes) {
  let bad = { semChao: 0, degrau: 0, parede: 0, poste: 0, offAsfalto: 0 }, tot = 0, wx = null;
  for (let i = 0; i < L.n; i++) {
    const x = L.x[i], y = L.y[i], z = L.z[i]; tot++;
    const g = gy(x, y, z, 1.5); if (g === null) { bad.semChao++; continue; }
    if (Math.abs(g - y) > 1.2) bad.degrau++;
    if (w.hit && w.surf[w.hit.tri] !== 1) bad.offAsfalto++;
    // parede a frente na altura do para-choque
    if (i < L.n - 1) { const dx = L.x[i + 1] - x, dz = L.z[i + 1] - z, dl = Math.hypot(dx, dz) || 1; if (w.raycast(x, g + 0.55, z, dx / dl, 0, dz / dl, dl, -1) && w.hit.t < dl - 0.2 && Math.abs(w.hit.ny) < 0.5) { bad.parede++; wx = wx || [x, z]; } }
    for (const l of props.lamps) if (Math.abs(l[0] - x) < 1.6 && Math.abs(l[2] - z) < 1.6 && Math.abs(l[1] - y) < 4 && Math.hypot(l[0] - x, l[2] - z) < 1.5) { bad.poste++; wx = wx || [l[0], l[2]]; break; }
  }
  const s = bad.semChao + bad.parede + bad.poste + bad.degrau;
  if (s > 0 && (bad.semChao > 1 || bad.parede > 0 || bad.poste > 0 || bad.degrau > 1)) add('lanes.problema', L.id, { e: `${L.e.a}->${L.e.b}`, dir: L.dir, len: +L.len.toFixed(0), tot, ...bad, at: wx && wx.map(Math.round) });
}
// ---- postes ----
props.lamps.forEach((l, i) => {
  const [x, y, z, ux, uz] = l, g = gy(x, y, z, 2);
  const r = {};
  if (g === null) r.semChao = 1; else { const d = y - g; if (d > 0.35) r.flutuando = +d.toFixed(2); if (d < -0.4) r.enterrado = +(-d).toFixed(2); r.surf = w.surf[w.hit.tri]; }
  // dentro de parede: esfera nas alturas 1..3
  let wall = 0; for (const h of [0.8, 1.6, 2.6]) { const n = w.sphere(x, y + h, z, 0.28, undefined); let deep = 0; for (let k = 0; k < n; k++) deep = Math.max(deep, w.cn[k * 7 + 3]); if (deep > 0.2) wall++; } if (wall >= 2) r.naParede = wall;
  // dentro da pista (a menos de 1.3 m do centro de uma faixa)
  for (const L of T.lanes) { let hit = false; for (let k = 0; k < L.n; k++) if (Math.abs(L.y[k] - y) < 3 && Math.hypot(L.x[k] - x, L.z[k] - z) < 1.3) { hit = true; break; } if (hit) { r.naFaixa = L.id; break; } }
  for (let j = 0; j < i; j++) { const m = props.lamps[j]; if (Math.hypot(m[0] - x, m[2] - z) < 2.0 && Math.abs(m[1] - y) < 3) { r.duplicado = j; break; } }
  if (Object.keys(r).filter(k => k !== 'surf').length) add('lamps.problema', i, Object.assign({ x: +x.toFixed(0), z: +z.toFixed(0) }, r));
});
// ---- grafo ----
const deg = {}; for (const e of tj.edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
const semSaida = T.nodes.filter(n => n.dep.length === 0 || n.arr.length === 0).map(n => n.id !== undefined ? n.id : null);
console.log('faixas', T.lanes.length, 'com problema', (out.lanes.problema || []).length);
console.log('postes', props.lamps.length, 'com problema', (out.lamps.problema || []).length);
const cnt = {}; for (const [, d] of out.lamps.problema || []) for (const k of Object.keys(d)) if (!['x', 'z', 'surf'].includes(k)) cnt[k] = (cnt[k] || 0) + 1; console.log('postes por tipo', cnt);
const cl = {}; for (const [, d] of out.lanes.problema || []) for (const k of ['semChao', 'degrau', 'parede', 'poste', 'offAsfalto']) if (d[k] > 0) cl[k] = (cl[k] || 0) + 1; console.log('faixas por tipo', cl);
console.log('nos sem saida/entrada', T.nodes.filter(n => n.dep.length === 0 || n.arr.length === 0).length, 'de', T.nodes.length);
fs.writeFileSync(process.env.OUT || '/tmp/auditoria.json', JSON.stringify(out));
