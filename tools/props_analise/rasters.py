import numpy as np, cv2, json, time
t0=time.time()
d=np.load('/home/claude/city_tris.npz'); T,U,PI,M=d['T'],d['U'],d['PI'],d['M']
man=json.load(open('/home/claude/proj/Horizon-Club-Unlimited-main/assets/city.json'))
cat=np.array([p['c'] for p in man['prims']])[PI]
cell=np.load('/home/claude/cell.npy')
RES=0.5; X0=8.0; Z0=-3040.0
W=int((2510-X0)/RES); H=int((20-Z0)/RES)
print(W,H)
def pts(p,res=RES,x0=X0,z0=Z0,sh=2):
    return (np.stack([(p[:,0]-x0)/res,(p[:,2]-z0)/res],1)*(1<<sh)).astype(np.int32)
street=np.where(cat=='Street')[0]
ASPH={3,9,13}; WALK={8,6}
cl=np.zeros(len(T),np.uint8)
for k in street:
    c=cell[k]; cl[k]=1 if c in ASPH else (2 if c in WALK else (4 if c==13 else 3))
cl[street[cell[street]==13]]=4   # 4 = cruzamento/faixa (asfalto com faixa)
# top-wins
cls=np.zeros((H,W),np.uint8); hT=np.full((H,W),np.nan,np.float32)
order=street[np.argsort(T[street,:,1].mean(1))]
for k in order:
    p=pts(T[k]); cv2.fillConvexPoly(cls,p,int(cl[k]),lineType=cv2.LINE_8,shift=2)
    cv2.fillConvexPoly(hT,p,float(T[k,:,1].mean()),lineType=cv2.LINE_8,shift=2)
hT[cls==0]=np.nan
print('top',time.time()-t0)
# bottom-wins (1 m)
R1=1.0; W1=int(W*RES/R1); H1=int(H*RES/R1)
hL=np.full((H1,W1),np.nan,np.float32); hTop1=np.full((H1,W1),np.nan,np.float32)
for k in order[::-1]:
    p=pts(T[k],R1); cv2.fillConvexPoly(hL,p,float(T[k,:,1].mean()),shift=2)
for k in order:
    p=pts(T[k],R1); cv2.fillConvexPoly(hTop1,p,float(T[k,:,1].mean()),shift=2)
print('low',time.time()-t0)
np.savez_compressed('rasters.npz',cls=cls,hT=hT,hL=hL,hTop1=hTop1)
ov=(hTop1-hL)>3.0; ov[np.isnan(ov.astype(float))]=False
print('bridge px(1m):',int(np.nansum(ov)))
cv2.imwrite('bridge.png',(ov*255).astype(np.uint8)[::2,::2])
