import pickle, json, numpy as np, math
d=np.load('rast.npz'); Y_top,Y_low=d['Y_top'],d['Y_low']; X0,Z0=float(d['X0']),float(d['Z0'])
nodes,edges=pickle.load(open('graph_final.pkl','rb'))
props=json.load(open('repo/assets/props.json')); J=props['junctions']
YR={'A':Y_low,'B':Y_top}
def ysamp(tag,x,z):
    r=int(round(z-Z0-0.5)); c=int(round(x-X0-0.5)); Y=YR[tag]
    for k in (1,2,3,5,8):
        sub=Y[max(0,r-k):r+k+1,max(0,c-k):c+k+1]; v=sub[sub>-1000]
        if len(v): return float(np.median(v))
    return 0.0
used=sorted({e['a'] for e in edges}|{e['b'] for e in edges}); idx={n:i for i,n in enumerate(used)}
N=[]
for n in used:
    m=nodes[n]; tag=m['tag']; y=ysamp(tag if tag in 'AB' else 'A',m['x'],m['z'])
    jj=-1
    N.append({'x':round(m['x'],1),'y':round(y,2),'z':round(m['z'],1),'R':round(float(np.clip(m['dt']+3,6,20)),1),'j':jj})
for k,(jx,jz) in enumerate(J):
    best=None
    for i,n in enumerate(used):
        m=nodes[n]
        if m['tag']!='A': continue
        dd=math.hypot(jx-m['x'],jz-m['z'])
        if dd<30 and (best is None or dd<best[0]): best=(dd,i)
    if best: N[best[1]]['j']=k
E=[]
for e in edges:
    tag=e['tag'] if e['tag'] in 'AB' else None
    ys=[]
    for x,z in zip(e['x'],e['z']):
        t=tag or ('A' if abs(ysamp('A',x,z)-ysamp('B',x,z))<0.5 else 'B')
        ys.append(ysamp(t,x,z))
    ys=np.array(ys)
    from scipy.ndimage import gaussian_filter1d
    if len(ys)>5: ys=gaussian_filter1d(ys,1.5,mode='nearest')
    p=[]
    for x,y,z in zip(e['x'],ys,e['z']): p+= [round(float(x),1),round(float(y),2),round(float(z),1)]
    E.append({'a':idx[e['a']],'b':idx[e['b']],'t':e['tag'],'p':p,'w':[round(float(w),1) for w in e['w']]})
json.dump({'nodes':N,'edges':E},open('traffic.json','w'),separators=(',',':'))
import os;print(os.path.getsize('traffic.json'),len(N),len(E),'junction-nodes with sig:',sum(1 for n in N if n['j']>=0),'of',len(J),'junctions; matched ids',sorted({n['j'] for n in N if n['j']>=0}))
