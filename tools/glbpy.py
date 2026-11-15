import json, struct, numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
    def __init__(s,path):
        d=open(path,'rb').read()
        _,_,L=struct.unpack('<4sII',d[:12]); o=12
        s.bin=None
        while o<L:
            cl,ct=struct.unpack('<I4s',d[o:o+8]); o+=8
            if ct==b'JSON': s.j=json.loads(d[o:o+cl])
            elif ct[:3]==b'BIN': s.bin=d[o:o+cl]
            o+=cl
    def view(s,i):
        v=s.j['bufferViews'][i]; o=v.get('byteOffset',0); return s.bin[o:o+v['byteLength']]
    def acc(s,i):
        a=s.j['accessors'][i]; bv=s.j['bufferViews'][a['bufferView']]
        dt=CT[a['componentType']]; n=NC[a['type']]; cnt=a['count']
        o=bv.get('byteOffset',0)+a.get('byteOffset',0)
        stride=bv.get('byteStride') or dt().nbytes*n
        if stride==dt().nbytes*n:
            r=np.frombuffer(s.bin,dtype=dt,count=cnt*n,offset=o).reshape(cnt,n)
        else:
            r=np.empty((cnt,n),dt)
            for k in range(cnt): r[k]=np.frombuffer(s.bin,dtype=dt,count=n,offset=o+k*stride)
        return r
    def local(s,n):
        if 'matrix' in n: return np.array(n['matrix'],dtype=np.float64).reshape(4,4).T
        m=np.eye(4); t=n.get('translation',[0,0,0]); q=n.get('rotation',[0,0,0,1]); sc=n.get('scale',[1,1,1])
        x,y,z,w=q
        R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
        m[:3,:3]=R*np.array(sc); m[:3,3]=t; return m
    def walk(s):
        """yield (node_index,node,world4x4)"""
        out=[]
        def rec(i,P):
            n=s.j['nodes'][i]; W=P@s.local(n); out.append((i,n,W))
            for c in n.get('children',[]): rec(c,W)
        for r in s.j['scenes'][0]['nodes']: rec(r,np.eye(4))
        return out
