import numpy as np, cv2, json
from scipy import ndimage as ndi
from PIL import Image
W,H=2502,3060; X0,Z0=8.0,-3040.0
a=np.frombuffer(open('shots/grid_all1m.bin','rb').read(),dtype=np.uint8).reshape(H,W,10)
s1=a[:,:,0]; y1=np.frombuffer(np.ascontiguousarray(a[:,:,1:5]).tobytes(),dtype='<f4').reshape(H,W)
s2=a[:,:,5]; y2=np.frombuffer(np.ascontiguousarray(a[:,:,6:10]).tobytes(),dtype='<f4').reshape(H,W)
sea=(s1==255)|(y1<0.05)
land=~sea
road=(s1==1)&land
deck=road&(s2!=255)&((y1-y2)>3.5)
deck=cv2.morphologyEx(deck.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)).astype(bool)&road
gr=road&~deck
print('land %.1f%% road %d deck %d'%(100*land.mean(),road.sum(),deck.sum()))
def soft(mask,s=0.9):
    b=cv2.GaussianBlur(mask.astype(np.float32),(0,0),s); return np.clip((b-0.3)/0.4,0,1)[...,None]
def paint(img,mask,col,alpha=1.0):
    m=soft(mask)*alpha; img[:]=img*(1-m)+np.array(col,np.float32)*m
img=np.zeros((H,W,3),np.float32)
# ---- agua: profundidade (leito do mar) + distancia da costa ----
dist=ndi.distance_transform_edt(sea)
seabed=np.where(y2>-9000,-y2,6.0); depth=np.clip(np.where(sea,np.maximum(seabed,np.minimum(dist/45.0,6)),0),0,6)
depth=cv2.GaussianBlur(depth.astype(np.float32),(0,0),6)
t=np.clip(depth/5.5,0,1)[...,None]
shallow=np.array([58,132,160],np.float32); deep=np.array([14,44,76],np.float32)
img[:]=shallow*(1-t)+deep*t
# ondas sutis
rng=np.random.default_rng(3); n=cv2.GaussianBlur(rng.normal(0,1,(H,W)).astype(np.float32),(0,0),3.0)
img+= (n*9)[...,None]*0.6*(1-t)
# ---- terreno ----
base=np.array([40,52,66],np.float32)
paint(img,land,base)
paint(img,land&(s1==2),(46,78,62))
paint(img,land&(s1==3),(88,78,56))
# calcadas/areas urbanas ligeiramente mais claras
paint(img,land&(s1==0),(52,66,82),0.75)
# ---- predios: telhados bem acima do chao local ----
yy=np.where(land,y1,np.nan); yf=np.nan_to_num(yy,nan=0.0)
low=cv2.erode(yf.astype(np.float32),np.ones((61,61),np.uint8))
bld=land&(s1==0)&((yf-low)>4.5)
bld=cv2.morphologyEx(bld.astype(np.uint8),cv2.MORPH_OPEN,np.ones((3,3),np.uint8)).astype(bool)
edge=bld&~cv2.erode(bld.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool)
paint(img,bld,(74,90,112)); paint(img,edge,(34,42,54),0.9)
# ---- costa ----
coast=cv2.dilate(land.astype(np.uint8),np.ones((5,5),np.uint8)).astype(bool)&~land
paint(img,coast,(120,170,200),0.55)
# ---- ruas ----
k5=np.ones((5,5),np.uint8)
cas=cv2.dilate(gr.astype(np.uint8),k5).astype(bool)
paint(img,cas,(12,17,24)); paint(img,gr,(205,216,228))
# faixa central leve nas ruas largas
core=cv2.erode(gr.astype(np.uint8),np.ones((15,15),np.uint8)).astype(bool)
paint(img,core,(188,200,214),0.5)
# ---- viadutos / via expressa: sombra + borda + ambar ----
sh=np.zeros((H,W),np.float32); sh[deck]=1; sh=cv2.GaussianBlur(np.roll(np.roll(sh,6,0),4,1),(0,0),5)
img*= (1-0.55*sh)[...,None]
casd=cv2.dilate(deck.astype(np.uint8),k5).astype(bool)
paint(img,casd,(10,12,16)); paint(img,deck,(250,186,64))
dcore=cv2.erode(deck.astype(np.uint8),np.ones((9,9),np.uint8)).astype(bool)
paint(img,dcore,(255,208,110),0.6)
out=np.clip(img,0,255).astype(np.uint8)
Image.fromarray(out).save('shots/map_full.png')
Image.fromarray(out).save('map_full.webp',quality=90,method=6)
mini=cv2.resize(out,(W//2,H//2),interpolation=cv2.INTER_AREA)
Image.fromarray(mini).save('map_mini.webp',quality=90,method=6)
import os; print(os.path.getsize('map_full.webp')//1024,'KB full',os.path.getsize('map_mini.webp')//1024,'KB mini')
Image.fromarray(cv2.resize(out,(W//3,H//3),interpolation=cv2.INTER_AREA)).save('shots/map_prev.png')
