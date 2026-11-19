import json,numpy as np,cv2
from scipy import ndimage as ndi
d=np.load('rast.npz'); X0=float(d['X0']);Z0=float(d['Z0'])
S=d['S_top'];Y=d['Y_top'];Wm=d['Wm'];Wy=d['Wy']
Yn=np.where((Wm==0)&(Y>-1000),Y,1e4).astype(np.float32)
deck=ndi.minimum_filter(Yn,size=7)           # piso mais baixo ao redor
mur=(Wm>0)&(Wy>-1000)&((Wy-deck)>0.55)&((Wy-deck)<2.5)&(deck<1e3)
np.savez_compressed('mur.npz',mur=mur,deck=deck)
print(mur.sum())
