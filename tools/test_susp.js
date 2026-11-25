// teste de fisica: node tools/test_susp.js   (assentamento, lombada, curva, queda; todos os carros de cars.json)
const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..');
const { World, Vehicle, buildCollision } = require(root + '/src/core.js');
const cars = JSON.parse(fs.readFileSync(root + '/assets/cars/cars.json')).cars;
function quad(a, b, c, d) { return [...a, ...b, ...c, ...a, ...c, ...d]; }
const T = []; for (let x = -300; x < 300; x += 20) for (let z = -300; z < 300; z += 20) T.push(...quad([x, 0, z], [x, 0, z + 20], [x + 20, 0, z + 20], [x + 20, 0, z]));
// lombada em z=0 (h 0.12 m, comprimento 1 m) e 'valeta' de terra
T.push(...quad([-20, 0, 0], [-20, .12, .5], [20, .12, .5], [20, 0, 0]), ...quad([-20, .12, .5], [-20, 0, 1], [20, 0, 1], [20, .12, .5]));
const V = Float32Array.from(T), surf = new Uint8Array(V.length / 9).fill(1), w = new World(V, surf, 16);
const dt = 1 / 120, run = (c, s, f) => { for (let i = 0; i < s * 120; i++) c.step(dt, f(i * dt, c)); };
let bad = 0;
for (const car of cars) {
  const S = car.scale, mk = () => { const c = new Vehicle(w, { scale: S, roof: car.realH ? car.realH * 1.3 : 0, params: Object.assign({}, car.params) }); c.place(0, 1.2, -100, 0); return c; };
  let c = mk(); run(c, 3, () => ({ throttle: 0, brake: 0, hb: 0, steer: 0 }));
  const sag = c.wheels.map(x => c.P.L0 - x.d), rest = c.p[1], ok1 = c.onGround === 4 && Math.abs(c.v[1]) < 0.05 && c.R[4] > 0.99;
  // lombada a 50 km/h
  c = mk(); c.place(0, 1.2, -40, 0); c.v = [0, 0, 14]; c.wheels.forEach(x => x.om = 14 / c.P.wr); let maxPitch = 0, air = 0, maxUp = 0;
  run(c, 4, (t, c) => { maxPitch = Math.max(maxPitch, Math.abs(c.R[7])); if (!c.onGround) air += dt; maxUp = Math.max(maxUp, c.p[1] - rest); return { throttle: 0.2, brake: 0, hb: 0, steer: 0 }; });
  const ok2 = c.R[4] > 0.95 && isFinite(c.p[1]);
  // curva forte a 90 km/h (capotagem?)
  c = mk(); c.place(0, 1.2, -250, 0); c.v = [0, 0, 25]; c.wheels.forEach(x => x.om = 25 / c.P.wr); let minUp = 1;
  run(c, 5, (t, c) => { minUp = Math.min(minUp, c.R[4]); return { throttle: Math.min(1, Math.max(0, (25 - c.fwdSpeed) * .4)), brake: 0, hb: 0, steer: 1 }; });
  const sp = Math.hypot(c.v[0], c.v[2]), glat = sp * Math.abs(c.yawRate) / 9.81, ok3 = minUp > 0.85;
  if (!(ok1 && ok2 && ok3)) bad++;
  console.log(car.params.susp.padEnd(8), car.id.slice(0, 34).padEnd(34), 'sag', (sag[0] * 100).toFixed(1) + 'cm', 'y', rest.toFixed(2), 'rest', ok1 ? 'ok' : 'FALHA', '| lombada air', air.toFixed(2), 'pitch', maxPitch.toFixed(2), ok2 ? 'ok' : 'FALHA', '| curva', glat.toFixed(2) + 'g', 'upMin', minUp.toFixed(2), ok3 ? 'ok' : 'FALHA');
}
console.log('falhas:', bad, '/', cars.length);
