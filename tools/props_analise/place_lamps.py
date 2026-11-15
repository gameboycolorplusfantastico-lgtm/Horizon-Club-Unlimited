import numpy as np, cv2, json, math, time
from skimage import measure
f=np.load('fields.npz'); OX=float(f['OX']); OZ=float(f['OZ']); RES=0.5
dRoad,dNon,dObs,dOvh,dBr,dCross,SW,hT=[f[k] for k in ('dRoad','dNon','dObs','dOvh','dBr','dCross','SW','hT')]
H,W=dRoad.shape
DOFF=1.5; SPACING=32.0
def px(x,z): return (x-OX)/RES,(z-OZ)/RES
def at(a,x,z):
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES))
    if i<1 or j<1 or i>=W-1 or j>=H-1: return None
    return a[j,i]
def toroad(x,z):
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES))
    gx=float(dRoad[j,i+2]-dRoad[j,i-2]); gz=float(dRoad[j+2,i]-dRoad[j-2,i]); n=math.hypot(gx,gz)
    if n<1e-6: return None
    return -gx/n,-gz/n
def valid_pole(x,z,lamp=True):
    v=at(SW,x,z)
    if not v: return None
    if at(dNon,x,z)<0.9 or at(dObs,x,z)<1.2 or at(dOvh,x,z)<1.0 or at(dBr,x,z)<4.5 or at(dCross,x,z)<4.0: return None
    u=toroad(x,z)
    if u is None: return None
    hx,hz=x+u[0]*3.0,z+u[1]*3.0
    hv=at(dOvh,hx,hz)
    if hv is None or hv<1.0: return None
    dr=at(dRoad,x,z); h0=hT[int(round((z-OZ)/RES)),int(round((x-OX)/RES))]
    h1=at(hT,x+u[0]*(dr+0.7),z+u[1]*(dr+0.7))
    if np.isnan(h0) or h1 is None or np.isnan(h1) or abs(h0-h1)>0.55: return None
    # chão plano em volta (3x3 m)
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES)); blk=hT[j-2:j+3,i-2:i+3]
    if np.isnan(blk).any() or np.ptp(blk)>0.6: return None
    return dict(x=float(x),z=float(z),h=float(h0),ux=u[0],uz=u[1])
t0=time.time()
cons=measure.find_contours(dRoad,DOFF)
print('contours',len(cons),time.time()-t0)
lamps=[]
for c in cons:
    if len(c)<40: continue
    # ponto (linha, coluna) -> x,z
    P=np.stack([OX+c[:,1]*RES, OZ+c[:,0]*RES],1)
    seg=np.hypot(*np.diff(P,axis=0).T); s=np.concatenate([[0],np.cumsum(seg)])
    L=s[-1]
    if L<20: continue
    # reamostra a cada 1 m
    ss=np.arange(0,L,1.0)
    Q=np.stack([np.interp(ss,s,P[:,0]),np.interp(ss,s,P[:,1])],1)
    # curvatura: giro entre direção em s-8 e s+8
    n=len(Q)
    def heading(k):
        a=Q[(k+4)%n if (c[0]==c[-1]).all() else min(n-1,k+4)]-Q[(k-4)%n if (c[0]==c[-1]).all() else max(0,k-4)]
        return math.atan2(a[1],a[0])
    closed=bool((c[0]==c[-1]).all())
    placed=[]; t=(hash((round(Q[0,0]),round(Q[0,1])))%int(SPACING))*1.0
    while t<L:
        k=int(t)
        ok=None
        for dk in (0,2,-2,4,-4,6,-6,8,-8):
            kk=k+dk
            if kk<0 or kk>=n: continue
            p=Q[kk]
            # curva fechada demais (>35° em 16 m) = quina de esquina: pula
            if closed or (8<=kk<n-8):
                h1=heading((kk-8)%n if closed else kk-8); h2=heading((kk+8)%n if closed else kk+8)
                dh=abs((h2-h1+math.pi)%(2*math.pi)-math.pi)
                if dh>math.radians(40): continue
            res=valid_pole(p[0],p[1])
            if res: ok=res; break
        if ok: lamps.append(ok)
        t+=SPACING
print('lamps raw',len(lamps),time.time()-t0)
# remove vizinhos muito próximos (<14 m) de contornos opostos
keep=[]
from scipy.spatial import cKDTree
pts=np.array([[l['x'],l['z']] for l in lamps]); tree=cKDTree(pts); dead=set()
for a,b in sorted(tree.query_pairs(14.0)):
    if a in dead or b in dead: continue
    dead.add(b)
lamps=[l for i,l in enumerate(lamps) if i not in dead]
print('lamps',len(lamps))
json.dump(lamps,open('lamps.json','w'))
