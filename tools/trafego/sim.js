const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync('./src/mods/traffic.js','utf8')+'\n;this.Traffic=Traffic;';
const ctx={console,Math,Float64Array,Float32Array,Map,Object,Array,Number,String,JSON}; vm.createContext(ctx); vm.runInContext(code,ctx);
const T=ctx.Traffic; const tj=JSON.parse(fs.readFileSync('./assets/traffic.json')), props=JSON.parse(fs.readFileSync('./assets/props.json')), npc=JSON.parse(fs.readFileSync('./assets/npc/npc.json'));
const R={sigState(j,axis,t){const p=(t+j*7.3+axis*13)%26;return p<10?2:(p<12?1:0);}, async loadNpc(){}};
(async()=>{
await T.init(R,tj,props,npc,null,1);
const px=+process.argv[2]||1047, pz=+process.argv[3]||-1717, secs=+process.argv[4]||300;
const veh={p:[px,20,pz],v:[0,0,0],R:[1,0,0,0,1,0,0,0,1],P:{scale:1.2,mass:1500},spheres:[],impact:0};
veh.R=[0,0,1, 0,1,0, 1,0,0]; // forward = R[2],R[8] = (1,0)?? ajusta
veh.R[2]=0;veh.R[8]=1;
T.cfg.count=+process.argv[5]||40; T.cfg.ignorePlayer=true;
let t=0; const dt=0.05; const stats={redRuns:0, minV:0, ghost:0, wrecks:0, spawned:0};
const seenIds=new Set(); const idle={};
const trace=[];
while(t<secs){ T.step(dt,veh,t); t+=dt;
  for(const c of T.cars){ seenIds.add(c.id); if(c.ghost>0) stats.ghost+=dt; if(c.hit>0) stats.wrecks++;
    // run red: car in connector at signaled node entering when red for > 3s? check at connector start
    if(c.conn && c.s<0.3 && c.conn.a.axis>=0){ const st=R.sigState(c.conn.a.sigJ,c.conn.a.axis,t); const phase=(t+c.conn.a.sigJ*7.3+c.conn.a.axis*13)%26; if(st===0 && phase>14.5 && c.v>1) stats.redRuns++; }
  }
  if(Math.abs(t%10)<dt) trace.push([t, T.cars.length, T.cars.filter(c=>c.v<0.3).length]);
}
console.log('spawned total',seenIds.size,'redRuns',stats.redRuns,'ghost s',stats.ghost.toFixed(0),'wreckframes',stats.wrecks);
console.log(trace.map(a=>a.join('/')).join(' '));
// final positions
const why={}; for(const c of T.cars) if(c.v<0.3){ why[c.why||'none']=(why[c.why||'none']||0)+1; }
console.log('stuck why',JSON.stringify(why));
for(const c of T.cars) if(c.v<0.3 && c.why==='car'||c.why==='xing') { const o=c.whyO; console.log(c.id,c.why,Math.round(c.x),Math.round(c.z),'lane',c.lane.id,c.conn?'conn':'', 'wait',c.wait.toFixed(1),'other', o&&o!=='player'?(o.id+' v'+o.v.toFixed(1)+' '+Math.round(o.x)+','+Math.round(o.z)+' lane'+(o.lane?o.lane.id:'')+(o.conn?'conn':'')+' why:'+o.why+' ghost:'+o.ghost):o); }
for(const c of T.cars){ if(c.why!=='claim') continue; const nd=c.node, k=nd&&nd.claim; if(k&&k!==c){ console.log('waiter',c.id,'-> claimer',k.id,'v',k.v.toFixed(1),'why',k.why,'ghost',k.ghost.toFixed(1),'lane',k.lane.id,'conn',!!k.conn,'sameNode',k.node===nd,'age',(t-nd.claimT).toFixed(1)); } }
{const c=null; if(c){const nd=c.node; console.log('car3',c.id,c.why,c.v,c.wait,c.ghost,'lane',c.lane.id,'len',c.lane.len.toFixed(1),'s',c.s.toFixed(1),'conn',!!c.conn,'node deg',nd&&nd.deg,'j',nd&&nd.j,'axis',c.lane.axis,'next',c.next&&c.next.id,c.next&&c.next.len.toFixed(1),'claim',nd&&nd.claim&&nd.claim.id);}}
fs.writeFileSync('sim_pos.json',JSON.stringify(T.cars.map(c=>[c.x,c.z,c.hx,c.hz,c.model.id,c.v,c.conn?1:0])));
})();
