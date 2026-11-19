import numpy as np, cv2, json, math, pickle
from scipy.ndimage import gaussian_filter1d
d=np.load('rast.npz'); S_top,Y_top,S_low,Y_low=d['S_top'],d['Y_top'],d['S_low'],d['Y_low']; X0,Z0=float(d['X0']),float(d['Z0'])
sk_=np.load('skel.npz'); res=pickle.load(open('graph_raw.pkl','rb'))
DT={'A':sk_['dtA'],'B':sk_['dtB']}; YR={'A':Y_low,'B':Y_top}
def ysamp(tag,x,z):
    r=int(round(z-Z0-0.5)); c=int(round(x-X0-0.5)); Y=YR[tag]
    sub=Y[max(0,r-1):r+2,max(0,c-1):c+2]; v=sub[sub>-1000]
    return float(np.median(v)) if len(v) else None
nodes=[];edges=[]
for tag in 'AB':
    nd,ed=res[tag]; base=len(nodes)
    for n in nd: nodes.append({'x':n['x']+X0+0.5,'z':n['z']+Z0+0.5,'dt':n['dt'],'tag':tag})
    for e in ed:
        px=np.array(e['px'],float); xs=px[:,1]+X0+0.5; zs=px[:,0]+Z0+0.5
        a=base+e['a']; b=base+e['b']
        xs=np.r_[nodes[a]['x'],xs,nodes[b]['x']]; zs=np.r_[nodes[a]['z'],zs,nodes[b]['z']]
        w=np.array([DT[tag][int(r),int(c)]*2 for r,c in px.astype(int)]); w=np.r_[w[0],w,w[-1]]
        edges.append({'a':a,'b':b,'x':xs,'z':zs,'w':w,'tag':tag})
def resample(e,step=3.0):
    x,z,w=e['x'],e['z'],e['w']
    if len(x)>9:
        x=gaussian_filter1d(x,3,mode='nearest'); z=gaussian_filter1d(z,3,mode='nearest'); x[0],z[0]=e['x'][0],e['z'][0]; x[-1],z[-1]=e['x'][-1],e['z'][-1]
        w=gaussian_filter1d(w,6,mode='nearest')
    s=np.r_[0,np.cumsum(np.hypot(np.diff(x),np.diff(z)))]; Ltot=s[-1]
    n=max(2,int(round(Ltot/step))+1); ss=np.linspace(0,Ltot,n)
    return {'x':np.interp(ss,s,x),'z':np.interp(ss,s,z),'w':np.interp(ss,s,w),'L':Ltot}
for e in edges: e.update(resample(e))
# link A/B: pontas de B perto de nos de A
def deg():
    dg=np.zeros(len(nodes),int)
    for e in edges: dg[e['a']]+=1; dg[e['b']]+=1
    return dg
# remove espinhos curtos iterativamente
for _ in range(4):
    dg=deg(); keep=[]
    for e in edges:
        if e['L']<16 and (dg[e['a']]==1 or dg[e['b']]==1): continue
        keep.append(e)
    if len(keep)==len(edges): break
    edges=keep
# componentes pequenos
par=list(range(len(nodes)))
def f(i):
    while par[i]!=i: par[i]=par[par[i]]; i=par[i]
    return i
for e in edges: par[f(e['a'])]=f(e['b'])
tot={}
for e in edges: tot[f(e['a'])]=tot.get(f(e['a']),0)+e['L']
edges=[e for e in edges if tot[f(e['a'])]>=150]
print('edges',len(edges))
# liga rampas A<->B: pontas de grau 1
dg=deg()
for i,n in enumerate(nodes):
    if n['tag']=='B' and dg[i]==1:
        best=None
        for j,m in enumerate(nodes):
            if m['tag']=='A' and dg[j]>=1:
                dd=math.hypot(n['x']-m['x'],n['z']-m['z'])
                if dd<40:
                    ya=ysamp('A',m['x'],m['z']); yb=ysamp('B',n['x'],n['z'])
                    if ya is not None and yb is not None and abs(ya-yb)<6 and (best is None or dd<best[0]): best=(dd,j)
        if best:
            m=nodes[best[1]]; xs=np.array([n['x'],m['x']]); zs=np.array([n['z'],m['z']])
            e={'a':i,'b':best[1],'x':xs,'z':zs,'w':np.array([10,10.]),'tag':'L'}; e.update(resample(e)); edges.append(e); print('link',i,best[1],round(best[0],1))
pickle.dump((nodes,edges),open('graph_final.pkl','wb'))
dg=deg()
img=cv2.cvtColor(((S_low[::2,::2]==1)*60).astype(np.uint8),cv2.COLOR_GRAY2BGR)
for e in edges:
    pts=np.stack([(e['x']-X0)/2,(e['z']-Z0)/2],1).astype(np.int32)
    cv2.polylines(img,[pts],False,{'A':(0,255,255),'B':(0,140,255),'L':(255,0,255)}[e['tag']],1)
for i,n in enumerate(nodes):
    if dg[i]>0: cv2.circle(img,(int((n['x']-X0)/2),int((n['z']-Z0)/2)),3,(0,0,255) if dg[i]>=3 else (255,200,0),-1)
cv2.imwrite('graph_prev.png',img)
print('nodes used',(dg>0).sum(),'deg3+',(dg>=3).sum())
