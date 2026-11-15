import numpy as np, cv2, json, time, math
from scipy import ndimage as ndi
from skimage import measure
t0=time.time()
m=np.load('masks.npz'); r=np.load('rasters.npz'); hT=r['hT']
cls,road,cross,ov,obst,ovh=m['cls'],m['road'],m['cross'],m['ov'],m['obst'],m['ovh']
RES=0.5; X0=8.0; Z0=-3040.0
# recorte
ys,xs=np.where(road); pad=int(120/RES)
j0=max(0,ys.min()-pad); j1=min(road.shape[0],ys.max()+pad); i0=max(0,xs.min()-pad); i1=min(road.shape[1],xs.max()+pad)
S=(slice(j0,j1),slice(i0,i1)); OX=X0+i0*RES; OZ=Z0+j0*RES
cls=cls[S]; road=road[S]; cross=cross[S]; ov=ov[S]; obst=obst[S]>0; ovh=ovh[S]>0; hT=hT[S]
print('crop',cls.shape,OX,OZ)
def edt(mask_true_is_obstacle):   # distância (m) até o True mais próximo
    return (ndi.distance_transform_edt(~mask_true_is_obstacle)*RES).astype(np.float32)
SW=cls==2
nonSW=~(SW|road)
dRoad=edt(road); dNon=edt(nonSW); dObs=edt(obst); dOvh=edt(ovh); dBr=edt(ov|(cv2.dilate(ov.astype(np.uint8),np.ones((3,3),np.uint8))>0)); dCross=edt(cross)
print('edts',time.time()-t0)
np.savez_compressed('fields.npz',dRoad=dRoad,dNon=dNon,dObs=dObs,dOvh=dOvh,dBr=dBr,dCross=dCross,SW=SW,road=road,cross=cross,hT=hT,obst=obst,ovh=ovh,ov=ov,cls=cls,OX=OX,OZ=OZ)
