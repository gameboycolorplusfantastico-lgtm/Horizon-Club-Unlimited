import numpy as np, cv2, json
from skimage.morphology import skeletonize
from scipy import ndimage as ndi
d=np.load('rast.npz'); S_top,Y_top,S_low,Y_low=d['S_top'],d['Y_top'],d['S_low'],d['Y_low']; X0,Z0=float(d['X0']),float(d['Z0'])
diff=Y_top-Y_low
A=(S_low==1)
B=(S_top==1)&(diff>3.5)
def clean(m,minsz=400):
    m=cv2.morphologyEx(m.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m,connectivity=8)
    keep=np.zeros(n,bool); keep[1:]=st[1:,cv2.CC_STAT_AREA]>=minsz
    return keep[lab]
A=clean(A); B=clean(B,300)
print('A',A.sum(),'B',B.sum())
np.savez_compressed('layers.npz',A=A,B=B)
def skel(m):
    dt=cv2.distanceTransform(m.astype(np.uint8),cv2.DIST_L2,5)
    sk=skeletonize(m)
    return sk,dt
out={}
for nm,m in (('A',A),('B',B)):
    sk,dt=skel(m); out[nm]=(sk,dt); print(nm,'skel px',sk.sum())
np.savez_compressed('skel.npz',skA=out['A'][0],dtA=out['A'][1],skB=out['B'][0],dtB=out['B'][1])
img=np.zeros(A.shape+(3,),np.uint8); img[A]=(70,70,70); img[B]=(120,80,40)
img[out['A'][0]]=(0,255,255); img[out['B'][0]]=(0,160,255)
cv2.imwrite('skel_prev.png',img[::2,::2])
