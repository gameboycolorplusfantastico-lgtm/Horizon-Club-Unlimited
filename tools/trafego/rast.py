import numpy as np, cv2, time
V=np.fromfile('tris_V.bin',np.float32).reshape(-1,3,3); S=np.fromfile('tris_S.bin',np.uint8)
n=len(S); print(n)
X0,Z0,RES=8.0,-3040.0,1.0; W,H=2503,3061
e1=V[:,1]-V[:,0]; e2=V[:,2]-V[:,0]; N=np.cross(e1,e2); L=np.linalg.norm(N,axis=1)+1e-9; ny=np.abs(N[:,1])/L
ymean=V[:,:,1].mean(1)
flat=ny>0.6
def pts(T): return (np.stack([(T[:,0]-X0)/RES,(T[:,2]-Z0)/RES],1)*16).astype(np.int32)
idx=np.where(flat)[0]
top=idx[np.argsort(ymean[idx])]      # ascending: ultimo = mais alto
S_top=np.full((H,W),255,np.uint8); Y_top=np.full((H,W),-1e4,np.float32)
for k in top:
    p=pts(V[k]); cv2.fillConvexPoly(S_top,p,int(S[k]),shift=4); cv2.fillConvexPoly(Y_top,p,float(ymean[k]),shift=4)
bot=idx[np.argsort(-ymean[idx])]
S_low=np.full((H,W),255,np.uint8); Y_low=np.full((H,W),-1e4,np.float32)
for k in bot:
    p=pts(V[k]); cv2.fillConvexPoly(S_low,p,int(S[k]),shift=4); cv2.fillConvexPoly(Y_low,p,float(ymean[k]),shift=4)
# paredes (nao planas): mascara + altura max
wall=np.where(~flat)[0]; Wm=np.zeros((H,W),np.uint8); Wy=np.full((H,W),-1e4,np.float32)
for k in wall[np.argsort(V[wall][:,:,1].max(1))]:
    p=pts(V[k]); cv2.fillConvexPoly(Wm,p,1,shift=4); cv2.fillConvexPoly(Wy,p,float(V[k][:,1].max()),shift=4)
np.savez_compressed('rast.npz',S_top=S_top,Y_top=Y_top,S_low=S_low,Y_low=Y_low,Wm=Wm,Wy=Wy,X0=X0,Z0=Z0)
print('asph top',(S_top==1).sum(),'low',(S_low==1).sum())
img=np.zeros(S_top[::3,::3].shape+(3,),np.uint8)
t=S_top[::3,::3]; img[t==1]=(90,90,90); img[t==0]=(200,200,200); img[t==2]=(40,120,40)
cv2.imwrite('rast_prev.png',img)
