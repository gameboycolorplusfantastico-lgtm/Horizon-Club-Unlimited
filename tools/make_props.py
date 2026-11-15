#!/usr/bin/env python3
"""Gera assets/props.json + props.wasm (+ tex/props_*.jpg): postes de luz e sinaleiras a partir do GLB.
Uso: python3 tools/make_props.py SINALEIRAS.glb  /caminho/placements.json  assets
placements.json = {"lamps":[[x,y,z,ux,uz]...], "sigs":[[x,y,z,ax,az,junction,axis]...]}"""
import sys, os, io, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbpy import GLB
from PIL import Image
glb, plc, out = sys.argv[1:4]
g = GLB(glb); j = g.j
W = {i: (n, M) for i, n, M in g.walk()}
def parts(nodes):
    for i in nodes:
        n, M = W[i]; R = np.linalg.inv(M[:3, :3]).T
        for pi, pr in enumerate(j['meshes'][n['mesh']]['primitives']):
            a = pr['attributes']
            P = g.acc(a['POSITION']).astype(float); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            N = g.acc(a['NORMAL']).astype(float) @ R.T; U = g.acc(a['TEXCOORD_0']).astype(float)
            yield dict(P=P, N=N, U=U, I=g.acc(pr['indices']).astype(np.int64).reshape(-1), m=pr.get('material', 0), node=i)
comps = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'props_nodes.json')))
buf = bytearray()
def put(arr):
    while len(buf) % 4: buf.append(0)
    o = len(buf); buf.extend(arr.tobytes()); return o
def emit(items, mat):
    P = np.concatenate([it['P'] for it in items]); N = np.concatenate([it['N'] for it in items]); U = np.concatenate([it['U'] for it in items])
    I = []; base = 0
    for it in items: I.append(it['I'] + base); base += len(it['P'])
    I = np.concatenate(I)
    bmin, bmax = P.min(0), P.max(0); size = np.maximum(bmax - bmin, 1e-6)
    q = np.zeros((len(P), 4), '<u2'); q[:, :3] = np.round((P - bmin) / size * 65535)
    nn = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9); nq = np.zeros((len(P), 4), 'i1'); nq[:, :3] = np.round(nn * 127)
    umn, umx = U.min(0), U.max(0); us = np.maximum(umx - umn, 1e-6); uq = np.round((U - umn) / us * 65535).astype('<u2')
    d = {'m': mat, 'n': int(len(P)), 'ni': int(len(I)), 'bb': [float(x) for x in (*bmin, *bmax)]}
    d['p'] = put(q); d['nr'] = put(nq); d['u'] = put(uq); d['uvb'] = [float(umn[0]), float(umn[1]), float(umx[0]), float(umx[1])]
    d['it'] = 2; d['i'] = put(I.astype('<u2')); return d
MAT = {1: 0, 2: 1, 3: 2}   # material do GLB -> material do jogo (aço, carcaça, emissivo)
def build(nodes, origin, mirror, drop):
    items = [it for it in parts(nodes) if not drop(it)]
    for it in items:
        it['P'] = it['P'] - origin
        if mirror:
            it['P'][:, 0] *= -1; it['N'][:, 0] *= -1; it['I'] = it['I'].reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)
    groups = {}
    for it in items:
        key = ('s', it['m'])
        if len(it['P']) == 12 and it['m'] in (2, 3):   # lente (3 por cabeça): vermelho/amarelo/verde pelo UV
            k = 0 if it['U'][:, 0].min() < 0.30 else (1 if it['U'][:, 0].min() < 0.36 else 2)
            for on in (0, 1): groups.setdefault(('l', k, on), []).append(it)
            continue
        groups.setdefault(key, []).append(it)
    prims = []
    for key, its in groups.items():
        if key[0] == 's': d = emit(its, MAT[key[1]]); d['lens'] = -1
        else: d = emit(its, 2 if key[2] else 1); d['lens'] = key[1]; d['on'] = key[2]
        prims.append(d)
    return prims
lamp = build(comps['lamp'], np.array([1.485, 0.05, -52.2]), False, lambda it: it['m'] not in (1, 2, 3))
def dropS(it):
    P = it['P']; w = np.ptp(P[:, 0])
    return it['m'] in (0, 4, 5, 6, 7, 8) or (it['m'] == 2 and len(P) == 24 and w > 0.7)
sig = build(comps['sig'], np.array([30.075, 0.05, -52.365]), True, dropS)
os.makedirs(os.path.join(out, 'tex'), exist_ok=True)
def tex(idx, name, size=None):
    im = Image.open(io.BytesIO(g.view(j['images'][j['textures'][idx]['source']]['bufferView']))).convert('RGB')
    if size and im.width > size: im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(out, 'tex', name), quality=88, optimize=True); return 'tex/' + name
mats = [dict(name='steel', tex=tex(0, 'props_steel.jpg'), color=[1, 1, 1, 1], metal=0.55, rough=0.5, emis=0),
        dict(name='housing', tex=tex(1, 'props_signal.jpg', 1024), color=[1, 1, 1, 1], metal=0.25, rough=0.65, emis=0),
        dict(name='emissive', tex=tex(3, 'props_emit.jpg', 1024), color=[1, 1, 1, 1], metal=0.0, rough=1.0, emis=0.35)]
P = json.load(open(plc))
man = {'mats': mats, 'lamp': {'prims': lamp, 'armLen': 3.4}, 'sig': {'prims': sig, 'armLen': 10.7},
       'lamps': [[round(v, 3) for v in l] for l in P['lamps']], 'sigs': P['sigs'], 'junctions': P['junctions']}
open(os.path.join(out, 'props.wasm'), 'wb').write(buf); json.dump(man, open(os.path.join(out, 'props.json'), 'w'), separators=(',', ':'))
print('props.wasm', len(buf) // 1024, 'KB; lamps', len(P['lamps']), 'sigs', len(P['sigs']), 'prims', len(lamp), len(sig))
