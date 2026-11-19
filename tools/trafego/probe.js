const { chromium } = require('playwright'); const fs=require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 300)));
  await p.goto('http://localhost:8766/?q=low&shot=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.mode === 'menu', null, { timeout: 240000 });
  const lamps = JSON.parse(fs.readFileSync('repo/assets/props.json')).lamps.slice(626);
  const res = await p.evaluate((lamps) => {
    const w = window.__game.world, out = [];
    const rc = (x,y,z,dx,dy,dz,m) => w.raycast(x,y,z,dx,dy,dz,m,-1) ? w.hit.t : null;
    for (const [x,y,z,ux,uz] of lamps) {
      const ox = -ux, oz = -uz; // para fora (longe da pista)
      // origem 0,7 m para fora do poste atual (evita o prisma do proprio poste)
      const sx = x + ox*0.7, sz = z + oz*0.7; let best = null;
      for (const h of [1.0, 1.35]) { const t = rc(sx, y+h, sz, ox, 0, oz, 16); if (t !== null && (best === null || t < best.t)) best = { t, h }; }
      const r = { x, y, z, ux, uz, d1: best ? best.t + 0.7 : null };
      if (best) {
        const d1 = r.d1; // distancia da face (a partir do poste)
        const fx = x + ox*(d1+0.05), fz = z + oz*(d1+0.05);
        const t2 = rc(x + ox*(d1+3), y+1.15, z + oz*(d1+3), -ox, 0, -oz, 3); r.d2 = t2 !== null ? d1 + 3 - t2 : null;
        const th = r.d2 !== null ? r.d2 - d1 : 0.4; r.th = th; const dc = d1 + Math.min(th, 1.2) * 0.5;
        const cx = x + ox*dc, cz = z + oz*dc; const tt = rc(cx, y+4, cz, 0, -1, 0, 8); r.top = tt !== null ? y + 4 - tt : null;
        const tl = rc(x + ox*(dc-0.18), y+4, z + oz*(dc-0.18), 0,-1,0,8), tr2 = rc(x + ox*(dc+0.18), y+4, z + oz*(dc+0.18), 0,-1,0,8);
        r.flat = (tl !== null && tr2 !== null && tt !== null) ? Math.max(Math.abs(tl-tt), Math.abs(tr2-tt)) : null;
        r.cx = cx; r.cz = cz;
      }
      // chao sob o poste atual
      const g = rc(x, y+2, z, 0,-1,0, 6); r.g = g !== null ? y+2-g : null;
      out.push(r);
    }
    return out;
  }, lamps);
  fs.writeFileSync('probe_v.json', JSON.stringify(res)); console.log('done', res.length);
  await b.close();
})();
