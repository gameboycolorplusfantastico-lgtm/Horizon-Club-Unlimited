// Corrige postes/sinaleiras no assets/props.json: base enterrada/flutuando -> encosta no chao; poste dentro da faixa -> afasta (ou remove).
// uso: node tools/corrigir_postes.js [--dry]   (depois: python3 tools/build.py)
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..'), dry = process.argv.includes('--dry');
const { World, buildCollision } = require(root + '/src/core.js');
const man = JSON.parse(fs.readFileSync(root + '/assets/city.json')), b = fs.readFileSync(root + '/assets/city.wasm');
const { V, surf } = buildCollision(man, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); const w = new World(V, surf, 16);
const pf = root + '/assets/props.json', props = JSON.parse(fs.readFileSync(pf)), tj = JSON.parse(fs.readFileSync(root + '/assets/traffic.json'));
const ctx = { console: { log() {} }, Math, Float64Array, Float32Array, Map, Object, Array, Number, String, JSON }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(root + '/src/mods/traffic.js', 'utf8') + '\n;this.Traffic=Traffic;', ctx); const T = ctx.Traffic; T.build(tj, props);
const ground = (x, y, z) => w.raycast(x, y + 2, z, 0, -1, 0, 14, -2) ? { y: y + 2 - w.hit.t, s: w.surf[w.hit.tri] } : null;
const laneDist = (x, y, z) => { let m = 1e9; for (const L of T.lanes) for (let k = 0; k < L.n; k++) if (Math.abs(L.y[k] - y) < 3) { const d = Math.hypot(L.x[k] - x, L.z[k] - z); if (d < m) m = d; } return m; };
const st = { alturaCorrigida: 0, afastados: 0, removidos: 0 }, keep = [];
for (const l of props.lamps) {
  let [x, y, z, ux, uz] = l; const g = ground(x, y, z);
  if (g && Math.abs(y - g.y) > 0.15 && Math.abs(y - g.y) < 1.2) { l[1] = y = +g.y.toFixed(3); st.alturaCorrigida++; }
  if (laneDist(x, y, z) < 1.6) {
    let done = false;
    for (let d = 0.25; d <= 2.0 && !done; d += 0.25) for (const sg of [1, -1]) { // para fora (contra o braco) ou para dentro
      const nx = x - ux * d * sg, nz = z - uz * d * sg, gg = ground(nx, y, nz);
      if (gg && Math.abs(gg.y - y) < 0.3 && laneDist(nx, gg.y, nz) >= 2.0) { l[0] = +nx.toFixed(3); l[2] = +nz.toFixed(3); l[1] = +gg.y.toFixed(3); done = true; st.afastados++; break; }
    }
    if (!done) { st.removidos++; continue; }
  }
  keep.push(l);
}
props.lamps = keep;
// sinaleiras: so ajusta altura
for (const s of props.sigs) { const g = ground(s[0], s[1], s[2]); if (g && Math.abs(s[1] - g.y) > 0.3 && Math.abs(s[1] - g.y) < 1.2) { s[1] = +g.y.toFixed(3); st.alturaCorrigida++; } }
console.log(st, 'postes', keep.length);
if (!dry) fs.writeFileSync(pf, JSON.stringify(props));
