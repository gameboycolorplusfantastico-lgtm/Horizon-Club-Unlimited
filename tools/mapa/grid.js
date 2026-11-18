const { chromium } = require('playwright'); const fs = require('fs');
const [x0,x1,z0,z1,res,out] = process.argv.slice(2); const X0=+x0,X1=+x1,Z0=+z0,Z1=+z1,RES=+res;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 320, height: 180 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 150)));
  await p.goto('http://localhost:8766/?q=low&shot=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.mode === 'menu', null, { timeout: 120000 });
  const W = Math.round((X1-X0)/RES), H = Math.round((Z1-Z0)/RES);
  const info = await p.evaluate(() => { const w = window.__game.world; let mn=1e9,mx=-1e9; for (let i=1;i<w.V.length;i+=3){ if(w.V[i]<mn)mn=w.V[i]; if(w.V[i]>mx)mx=w.V[i]; } return {mn,mx}; });
  console.log('W,H',W,H,JSON.stringify(info));
  const buf = Buffer.alloc(W*H*10); // por celula: s1(u8) y1(f32) s2(u8) y2(f32)
  const t0=Date.now(); const ROWS=60;
  for (let r0=0; r0<H; r0+=ROWS) {
    const b64 = await p.evaluate(({r0,ROWS,W,H,X0,Z0,RES,top}) => {
      const w = window.__game.world; const n=Math.min(ROWS,H-r0); const a = new Uint8Array(W*n*10), dv = new DataView(a.buffer);
      for (let r=0;r<n;r++) for (let c=0;c<W;c++) {
        const x=X0+(c+0.5)*RES, z=Z0+(r0+r+0.5)*RES, o=(r*W+c)*10; let y=top;
        let s1=255,y1=-9999,s2=255,y2=-9999;
        if (w.raycast(x,y,z,0,-1,0,400,0.5)) { y1=y-w.hit.t; s1=w.surfAt(w.hit.tri); 
          if (w.raycast(x,y1-2.5,z,0,-1,0,400,0.5)) { y2=y1-2.5-w.hit.t; s2=w.surfAt(w.hit.tri); } }
        a[o]=s1; dv.setFloat32(o+1,y1,true); a[o+5]=s2; dv.setFloat32(o+6,y2,true);
      }
      let s=''; const ch=0x8000; for(let i=0;i<a.length;i+=ch) s+=String.fromCharCode.apply(null,a.subarray(i,i+ch)); return btoa(s);
    }, { r0, ROWS, W, H, X0, Z0, RES, top: info.mx + 5 });
    Buffer.from(b64,'base64').copy(buf, r0*W*10);
    if ((r0/ROWS)%10===0) console.log('row',r0,'/',H, ((Date.now()-t0)/1000).toFixed(0)+'s');
  }
  fs.writeFileSync(out, buf); console.log('done', W, H);
  await b.close();
})();
