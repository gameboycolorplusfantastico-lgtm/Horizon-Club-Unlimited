import json, numpy as np, sys
D='assets/'
man=json.load(open(D+'city.json')); buf=open(D+'city.wasm','rb').read()
def rd(off,dt,n,k): return np.frombuffer(buf,dtype=dt,count=n*k,offset=off).reshape(n,k)
tris=[];cats=[];uvs=[];mats=[]
for pi,p in enumerate(man['prims']):
    bb=np.array(p['bb']); mn,mx=bb[:3],bb[3:]
    q=rd(p['p'],'<u2',p['n'],4)[:,:3].astype(np.float64)/65535*(mx-mn)+mn
    u=rd(p['u'],'<u2',p['n'],2).astype(np.float64)/65535
    uvb=p['uvb']; u=u*np.array([uvb[2]-uvb[0],uvb[3]-uvb[1]])+np.array(uvb[:2])
    idx=rd(p['i'],'<u2' if p['it']==2 else '<u4',p['ni'],1).reshape(-1).astype(np.int64)
    t=idx.reshape(-1,3)
    tris.append(q[t]); uvs.append(u[t]); cats.append(np.full(len(t),pi)); mats.append(np.full(len(t),p['m']))
T=np.concatenate(tris);U=np.concatenate(uvs);PI=np.concatenate(cats);M=np.concatenate(mats)
np.savez('../city_tris.npz',T=T,U=U,PI=PI,M=M)
print(T.shape, man['bounds'], man['spawn'])
from collections import Counter
print(Counter((p['c'],p['m']) for p in man['prims']))
print([ (m['name'],m['mode']) for m in man['mats']])
