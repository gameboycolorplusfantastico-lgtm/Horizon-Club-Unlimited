import numpy as np, cv2, json, time
from scipy import ndimage as ndi
t0=time.time()
d=np.load('/home/claude/city_tris.npz'); T,U,PI,M=d['T'],d['U'],d['PI'],d['M']
man=json.load(open('/home/claude/proj/Horizon-Club-Unlimited-main/assets/city.json'))
cat=np.array([p['c'] for p in man['prims']])[PI]
r=np.load('rasters.npz'); cls=r['cls'].copy(); hT=r['hT']; hL=r['hL']; hTop1=r['hTop1']
RES=0.5; X0=8.0; Z0=-3040.0
H,W=cls.shape
# --- 1) estrada = componentes grandes de asfalto
A=((cls==1)|(cls==4)).astype(np.uint8)
lab,n=ndi.label(cv2.morphologyEx(A,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)))
sizes=ndi.sum(A,lab,range(1,n+1))*RES*RES
keep=np.zeros(n+1,bool); keep[1:]=sizes>=40000
road=keep[lab]&(A>0)
lot=(A>0)&~road
cls[lot]=3
isroad=road
cross=road&(cls==4)
print('road comps',keep.sum(),time.time()-t0)
# --- 2) ponte / camadas empilhadas (1 m -> 0.5 m)
ov1=((hTop1-hL)>3.0)&~np.isnan(hTop1)&~np.isnan(hL)
ov1=cv2.morphologyEx(ov1.astype(np.uint8),cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
lab1,n1=ndi.label(ov1); s1=ndi.sum(ov1,lab1,range(1,n1+1))
k1=np.zeros(n1+1,bool); k1[1:]=s1>=300; ov1=k1[lab1]
ov=cv2.resize(ov1.astype(np.uint8),(W,H),interpolation=cv2.INTER_NEAREST)>0
print('bridge area m2',ov.sum()*RES*RES)
# --- 3) obstáculos e coberturas (não-rua)
gy_img=hT
def lookup(h,x,z):
    i=np.clip(((x-X0)/RES).astype(int),0,W-1); j=np.clip(((z-Z0)/RES).astype(int),0,H-1); return h[j,i]
obst=np.zeros((H,W),np.uint8); ovh=np.zeros((H,W),np.uint8)
sel=np.where((cat=='Buildings')|(cat=='Opaque')|(cat=='Misc')|(cat=='Transparent'))[0]
c=T[sel].mean(1); g=lookup(hT,c[:,0],c[:,2]); ok=~np.isnan(g); sel=sel[ok]; g=g[ok]
ymin=T[sel,:,1].min(1)-g; ymax=T[sel,:,1].max(1)-g
isobs=(ymax>0.6)&(ymin<2.6); isovh=(ymin>3.2)&(ymin<16)
def paint(img,ids):
    for k in ids:
        p=(np.stack([(T[k,:,0]-X0)/RES,(T[k,:,2]-Z0)/RES],1)*4).astype(np.int32)
        cv2.fillConvexPoly(img,p,1,shift=2); cv2.polylines(img,[p],True,1,1,shift=2)
paint(obst,sel[isobs]); paint(ovh,sel[isovh])
print('obst',obst.sum()*RES*RES,'ovh',ovh.sum()*RES*RES,time.time()-t0)
np.savez_compressed('masks.npz',cls=cls,road=road,cross=cross,ov=ov,obst=obst,ovh=ovh)
# --- overview
pal=np.array([[0,0,0],[120,120,125],[235,235,235],[60,130,60],[200,60,200]],np.uint8)
vis=pal[cls]; vis[road]=(120,120,125); vis[cross]=(230,120,230)
vis[obst>0]=(40,40,160); vis[ovh>0]=(160,80,40); vis[ov]=(255,200,0)
cv2.imwrite('mask_overview.png',cv2.resize(vis,None,fx=0.25,fy=0.25,interpolation=cv2.INTER_AREA)[:,:,::-1])
