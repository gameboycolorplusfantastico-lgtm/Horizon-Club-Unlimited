// Re-cola a altura (y) de cada ponto das ruas de assets/traffic.json no chao real, seguindo a superficie continua (descarta picos: ponto que "pulou" para o viaduto de cima).
// uso: node tools/corrigir_trafego.js [--dry]
const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..'), dry = process.argv.includes('--dry');
const { World, buildCollision } = require(root + '/src/core.js');
const man = JSON.parse(fs.readFileSync(root + '/assets/city.json')), b = fs.readFileSync(root + '/assets/city.wasm');
const { V, surf } = buildCollision(man, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); const w = new World(V, surf, 16);
const f = root + '/assets/traffic.json', tj = JSON.parse(fs.readFileSync(f)); let changed = 0, big = 0, pts = 0;
const g = (x, z, ref, up, dn) => w.raycast(x, ref + up, z, 0, -1, 0, up + dn, 0.5) ? ref + up - w.hit.t : null;
for (const e of tj.edges) {
  const n = e.p.length / 3; let ref = null;
  // referencia inicial: mediana dos y
  const ys = []; for (let i = 0; i < n; i++) ys.push(e.p[i * 3 + 1]); ys.sort((a, c) => a - c); ref = ys[n >> 1];
  // acha o ponto de partida mais confiavel (mais perto da mediana) e propaga nos dois sentidos
  let i0 = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = Math.abs(e.p[i * 3 + 1] - ref); if (d < bd) { bd = d; i0 = i; } }
  const fix = (i, r) => { pts++; const y0 = e.p[i * 3 + 1], x = e.p[i * 3], z = e.p[i * 3 + 2]; let gy = g(x, z, r, 1.2, 2.2); if (gy === null) gy = r; const dy = Math.abs(gy - y0); if (dy > 0.05) { changed++; if (dy > 1) big++; e.p[i * 3 + 1] = +gy.toFixed(2); } return gy; };
  let r = fix(i0, e.p[i0 * 3 + 1]); for (let i = i0 + 1; i < n; i++) r = fix(i, r);
  r = e.p[i0 * 3 + 1]; for (let i = i0 - 1; i >= 0; i--) r = fix(i, r);
}
console.log({ pontos: pts, alterados: changed, 'saltos>1m': big });
if (!dry) fs.writeFileSync(f, JSON.stringify(tj));
