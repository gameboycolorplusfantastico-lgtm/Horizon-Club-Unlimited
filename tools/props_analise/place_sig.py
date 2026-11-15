import numpy as np, json, math
from scipy import ndimage as ndi
exec(open('place_lamps.py').read().split("t0=time.time()")[0])
roadm=f['road']; crossm=f['cross']; ovm=f['ov']
lab,n=ndi.label(cv2.morphologyEx(crossm.astype(np.uint8),cv2.MORPH_CLOSE,np.ones((5,5),np.uint8)))
def isroad(x,z):
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES))
    return 0<=i<W and 0<=j<H and roadm[j,i]
def iscross(x,z):
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES))
    return 0<=i<W and 0<=j<H and crossm[j,i]
def okpole(x,z):
    if not at(SW,x,z): return False
    if at(dNon,x,z)<0.9 or at(dObs,x,z)<1.2 or at(dOvh,x,z)<1.0 or at(dBr,x,z)<4.5: return False
    i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES)); b=hT[j-2:j+3,i-2:i+3]
    return not np.isnan(b).any() and np.ptp(b)<0.6
sigs=[]; junc=[]
for lb in range(1,n+1):
    ys,xs=np.where(lab==lb); area=len(ys)*RES*RES
    if area<300: continue
    cx=OX+xs.mean()*RES; cz=OZ+ys.mean()*RES
    if at(dBr,cx,cz)<10: continue
    runs=[]
    for k in range(72):
        a=k*math.pi/36; dx,dz=math.cos(a),math.sin(a); r=0
        while r<70 and isroad(cx+dx*r,cz+dz*r): r+=1
        runs.append(r)
    runs=np.array(runs); thr=35
    arms=[]; k=0; idx=[i for i in range(72) if runs[i]>=thr]
    if not idx: continue
    # clusters circulares
    groups=[]; 
    for i in idx:
        if groups and (i-groups[-1][-1])%72<=1: groups[-1].append(i)
        else: groups.append([i])
    if len(groups)>1 and (groups[0][0]-groups[-1][-1])%72<=1: groups[0]=groups.pop()+groups[0]
    jid=len(junc); jarms=[]
    for g in groups:
        ang=np.angle(np.mean([np.exp(1j*i*math.pi/36) for i in g]))
        ax,az=math.cos(ang),math.sin(ang)
        D=0
        while D<80 and (iscross(cx+ax*D,cz+az*D) or D<3): D+=1
        # largura da pista em D+4
        px_,pz_=cx+ax*(D+4),cz+az*(D+4)
        rx,rz=az,-ax   # direita de quem chega (viaja -a)
        wr=0
        while wr<30 and isroad(px_+rx*wr,pz_+rz*wr): wr+=0.5
        wl=0
        while wl<30 and isroad(px_-rx*wl,pz_-rz*wl): wl+=0.5
        jarms.append(dict(ang=ang,ax=ax,az=az,D=D,wr=wr,wl=wl))
    if len(jarms)<3: continue
    ph0=jarms[0]['ang']
    placed=0
    for a in jarms:
        d=abs((a['ang']-ph0+math.pi)%(2*math.pi)-math.pi); axis=0 if (d<math.radians(35) or d>math.radians(145)) else 1
        best=None
        for t in (3,4,5,2,6,7,8,9,10):
            bx,bz=cx+a['ax']*(a['D']+t),cz+a['az']*(a['D']+t)
            # ponto do meio-fio direito, depois 1.6 m para dentro da calçada
            rx,rz=a['az'],-a['ax']
            w=0
            while w<30 and isroad(bx+rx*w,bz+rz*w): w+=0.25
            for off in (1.6,2.2):
                x,z=bx+rx*(w+off),bz+rz*(w+off)
                if okpole(x,z):
                    # largura total da pista nesse ponto
                    wl=0
                    while wl<40 and isroad(bx-rx*wl,bz-rz*wl): wl+=0.25
                    best=(x,z,w+wl,t); break
            if best: break
        if not best: continue
        x,z,wtot,t=best
        i=int(round((x-OX)/RES)); j=int(round((z-OZ)/RES)); h=float(np.nanmedian(hT[j-1:j+2,i-1:i+2]))
        sigs.append(dict(x=x,z=z,h=h,ax=a['ax'],az=a['az'],j=jid,axis=axis,w=wtot)); placed+=1
    junc.append(dict(id=jid,x=cx,z=cz,arms=len(jarms),placed=placed))
print('junctions',len(junc),'signals',len(sigs), 'widths',np.percentile([s['w'] for s in sigs],[0,50,100]) if sigs else None)
json.dump(dict(sigs=sigs,junc=junc),open('sigs.json','w'))
