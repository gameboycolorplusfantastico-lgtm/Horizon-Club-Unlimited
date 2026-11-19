import numpy as np, cv2, json, math, sys
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
d=np.load('rast.npz'); S_top,Y_top,S_low,Y_low=d['S_top'],d['Y_top'],d['S_low'],d['Y_low']; X0,Z0=float(d['X0']),float(d['Z0'])
L=np.load('layers.npz'); A=L['A']; B=L['B']
sk_=np.load('skel.npz')
NB=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
def ncount(sk):
    return ndi.convolve(sk.astype(np.uint8),np.ones((3,3),np.uint8),mode='constant')-sk.astype(np.uint8)
def prune(sk,Lmax=10,rounds=3):
    sk=sk.copy()
    for _ in range(rounds):
        c=ncount(sk)*sk; ends=np.argwhere((c==1)&sk)
        for (r,cc) in ends:
            path=[(r,cc)]; prev=None; cur=(r,cc); ok=False
            for _s in range(Lmax):
                nb=[(cur[0]+a,cur[1]+b) for a,b in NB if 0<=cur[0]+a<sk.shape[0] and 0<=cur[1]+b<sk.shape[1] and sk[cur[0]+a,cur[1]+b] and (cur[0]+a,cur[1]+b)!=prev and (cur[0]+a,cur[1]+b) not in path]
                if len(nb)==0: break
                if len(nb)>=2 or c[nb[0]]>=3: ok=True; break
                prev=cur; cur=nb[0]; path.append(cur)
            if ok:
                for q in path: sk[q]=False
    return skeletonize(sk)
def build(mask,sk,dt,Yr,tag):
    sk=prune(sk); H,W=sk.shape
    c=ncount(sk)*sk
    J=(c>=3)&sk
    Jd=cv2.dilate(J.astype(np.uint8),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(11,11)))>0
    Jd&=sk
    nl,lab=cv2.connectedComponents(Jd.astype(np.uint8),connectivity=8)
    nodes=[]  # dict
    for k in range(1,nl):
        pts=np.argwhere(lab==k); cy,cx=pts.mean(0)
        r=float(dt[lab==k].max())
        nodes.append({'x':cx,'z':cy,'dt':r,'tag':tag,'cl':k})
    seg=sk&~Jd
    ns,sl=cv2.connectedComponents(seg.astype(np.uint8),connectivity=8)
    segc=ncount(seg)*seg
    edges=[]
    def near_cluster(p):
        r,cc=p
        for a in range(-2,3):
            for b in range(-2,3):
                y,x=r+a,cc+b
                if 0<=y<H and 0<=x<W and lab[y,x]>0: return int(lab[y,x])-1
        return -1
    for k in range(1,ns):
        pts=np.argwhere(sl==k)
        if len(pts)<3: continue
        ends=[tuple(p) for p in pts if segc[p[0],p[1]]<=1]
        if len(ends)==0: ends=[tuple(pts[0])]
        start=ends[0]; order=[start]; seen={start}; cur=start
        while True:
            nxt=None
            for a,b in NB:
                q=(cur[0]+a,cur[1]+b)
                if 0<=q[0]<H and 0<=q[1]<W and seg[q] and q not in seen and sl[q]==k: nxt=q; break
            if nxt is None: break
            order.append(nxt); seen.add(nxt); cur=nxt
        if len(order)<3: continue
        ca=near_cluster(order[0]); cb=near_cluster(order[-1])
        if ca<0: nodes.append({'x':order[0][1],'z':order[0][0],'dt':float(dt[order[0]]),'tag':tag,'cl':-1}); ca=len(nodes)-1
        if cb<0: nodes.append({'x':order[-1][1],'z':order[-1][0],'dt':float(dt[order[-1]]),'tag':tag,'cl':-1}); cb=len(nodes)-1
        edges.append({'a':ca,'b':cb,'px':order,'tag':tag})
    return nodes,edges
res={}
for tag,m,key in (('A',A,'A'),('B',B,'B')):
    sk=sk_['sk'+key]; dt=sk_['dt'+key]
    res[tag]=build(m,sk,dt,Y_low if tag=='A' else Y_top,tag)
    print(tag,len(res[tag][0]),'nodes',len(res[tag][1]),'edges')
import pickle; pickle.dump(res,open('graph_raw.pkl','wb'))
