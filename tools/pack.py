#!/usr/bin/env python3
"""Empacota os GLBs originais em formato compacto para o jogo (WebGL2 puro).
Uso: python3 tools/pack.py MAPA.glb assets   (so o mapa; carros agora usam tools/add_car.py)
- Mapa: bake das transformações em coordenadas de mundo (1 unidade ~ 1 m, Y para cima),
  posições int16 normalizadas, normais int8, UVs uint16, texturas em JPEG/WebP, minimapa PNG, ponto de spawn.
- Carro: escala para ~4,49 m, origem entre os eixos no chão, rodas separadas (FL/FR/RL/RR) com pivô.
"""
import sys, os, io, re, json, math, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbpy import GLB
from PIL import Image, ImageDraw

def qpos(P, bb_min, bb_max):
    size = np.maximum(bb_max - bb_min, 1e-6)
    q = np.round((P - bb_min) / size * 65535).clip(0, 65535).astype('<u2')
    out = np.zeros((len(P), 4), '<u2'); out[:, :3] = q; return out
def qnrm(N):
    n = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    out = np.zeros((len(N), 4), 'i1'); out[:, :3] = np.round(n * 127).clip(-127, 127); return out
def quv(U):
    mn = U.min(0); mx = U.max(0); size = np.maximum(mx - mn, 1e-6)
    return np.round((U - mn) / size * 65535).clip(0, 65535).astype('<u2'), [float(mn[0]), float(mn[1]), float(mx[0]), float(mx[1])]

class Writer:
    def __init__(s): s.buf = bytearray()
    def put(s, arr):
        while len(s.buf) % 4: s.buf.append(0)
        o = len(s.buf); s.buf += arr.tobytes(); return o
    def prim(s, P, N, U0, U1, idx, mat, extra=None):
        bmin, bmax = P.min(0), P.max(0)
        d = {'m': mat, 'n': int(len(P)), 'ni': int(len(idx)), 'bb': [float(x) for x in (*bmin, *bmax)]}
        d['p'] = s.put(qpos(P, bmin, bmax)); d['nr'] = s.put(qnrm(N))
        u, uvb = quv(U0); d['u'] = s.put(u); d['uvb'] = uvb
        if U1 is not None:
            u1, uvb1 = quv(U1); d['u1'] = s.put(u1); d['uvb1'] = uvb1
        if len(P) < 65536: d['it'] = 2; d['i'] = s.put(idx.astype('<u2'))
        else: d['it'] = 4; d['i'] = s.put(idx.astype('<u4'))
        if extra: d.update(extra)
        return d

def tex_out(g, i, path_noext, kind):
    im = g.j['images'][g.j['textures'][i]['source']]
    I = Image.open(io.BytesIO(g.view(im['bufferView'])))
    if kind == 'ao':
        r = I.convert('RGB').split()[0]; fn = path_noext + '.jpg'; r.save(fn, quality=80, optimize=True); return os.path.basename(fn)
    if kind == 'rgba':
        fn = path_noext + '.webp'; I.convert('RGBA').save(fn, quality=82, method=6); return os.path.basename(fn)
    fn = path_noext + '.jpg'; I.convert('RGB').save(fn, quality=86, optimize=True); return os.path.basename(fn)

ASPH = {(3, 0), (1, 2)}      # células de asfalto no atlas 4x4 da malha de ruas
GRASS = {(0, 3), (3, 3)}
def cell_class(u, v):
    c = (int(np.floor(u * 4)) % 4, int(np.floor(v * 4)) % 4)
    return 1 if c in ASPH else (2 if c in GRASS else 0)

def pack_city(src, out):
    g = GLB(src); W = Writer(); prims = []
    catname = lambda nm: re.sub(r'^\d+_\d+_', '', nm).split('_Level1')[0].replace('WorldCity', '')
    for i, n, M in g.walk():
        if 'mesh' not in n: continue
        cat = catname(n['name'])
        R = np.linalg.inv(M[:3, :3]).T
        for pr in g.j['meshes'][n['mesh']]['primitives']:
            a = pr['attributes']
            P = g.acc(a['POSITION']).astype(np.float64); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3] * 100.0
            N = g.acc(a['NORMAL']).astype(np.float64) @ R.T
            U0 = g.acc(a['TEXCOORD_0']).astype(np.float64)
            U1 = g.acc(a['TEXCOORD_1']).astype(np.float64) if 'TEXCOORD_1' in a else None
            idx = g.acc(pr['indices']).astype(np.int64).reshape(-1)
            d = W.prim(P, N, U0, U1, idx, pr['material'], {'c': cat}); prims.append(d)
            if cat == 'Street': prims[-1]['_P'] = P; prims[-1]['_I'] = idx; prims[-1]['_U'] = U0
    # materiais
    texdir = os.path.join(out, 'tex'); os.makedirs(texdir, exist_ok=True)
    mats = []
    for m in g.j['materials']:
        pb = m['pbrMetallicRoughness']; t = pb['baseColorTexture']['index']
        blend = m.get('alphaMode') == 'BLEND'
        nm = m['name'].replace('Level1', '').replace('_Material', '').lower()
        kind = 'rgba' if nm == 'transparent' else 'rgb'
        d = {'name': nm, 'tex': 'tex/city_%s' % nm + ('.webp' if kind == 'rgba' else '.jpg')}
        tex_out(g, t, os.path.join(texdir, 'city_' + nm), kind)
        if 'occlusionTexture' in m:
            ao = m['occlusionTexture']['index']; tex_out(g, ao, os.path.join(texdir, 'city_%s_ao' % nm), 'ao'); d['ao'] = 'tex/city_%s_ao.jpg' % nm
        d['mode'] = 'mask' if nm == 'transparent' else ('blend' if blend else 'opaque')
        mats.append(d)
    # minimapa + spawn
    street = [p for p in prims if '_P' in p]
    SP = np.concatenate([p['_P'][p['_I']].reshape(-1, 3, 3) for p in street]);
    SU = np.concatenate([p['_U'][p['_I']].reshape(-1, 3, 2) for p in street])
    cls = np.array([cell_class(*u.mean(0)) for u in SU])
    bb_all = np.array([p['bb'] for p in prims]); bmin = bb_all[:, :3].min(0); bmax = bb_all[:, 3:].max(0)
    spawn = make_minimap(out, prims, SP, cls, bmin, bmax)
    for p in prims:
        for k in ('_P', '_I', '_U'): p.pop(k, None)
    man = {'prims': prims, 'mats': mats, 'bounds': [float(x) for x in (*bmin, *bmax)], 'spawn': spawn,
           'minimap': {'img': 'minimap.png', 'res': MM_RES}}
    open(os.path.join(out, 'city.wasm'), 'wb').write(W.buf); json.dump(man, open(os.path.join(out, 'city.json'), 'w'), separators=(',', ':'))
    print('city.wasm', len(W.buf) // 1024, 'KB prims', len(prims), 'spawn', spawn)

MM_RES = 4.0
def make_minimap(out, prims, SP, cls, bmin, bmax):
    x0, z0 = bmin[0], bmin[2]; w = int((bmax[0] - x0) / MM_RES) + 2; h = int((bmax[2] - z0) / MM_RES) + 2
    im = Image.new('RGB', (w, h), (11, 22, 40)); dr = ImageDraw.Draw(im)
    tp = lambda t: [((p[0] - x0) / MM_RES, (p[2] - z0) / MM_RES) for p in t]
    order = np.argsort(SP[:, :, 1].mean(1))
    for k in order:
        if cls[k] != 1:
            y = SP[k, :, 1].mean(); col = (14, 40, 66) if y < 0.4 else ((36, 62, 52) if cls[k] == 2 else (50, 62, 74))
            dr.polygon(tp(SP[k]), fill=col)
    for k in order:
        if cls[k] == 1: dr.polygon(tp(SP[k]), fill=(150, 170, 190))
    im.save(os.path.join(out, 'minimap.png'), optimize=True)
    # spawn: asfalto plano e largo, com longa reta, perto do centro
    cx, cz = 1094.0, -1606.0; cell = 5.0; cg = {}
    for k in np.where(cls == 1)[0]:
        n = np.cross(SP[k][1] - SP[k][0], SP[k][2] - SP[k][0]); n /= max(np.linalg.norm(n), 1e-9)
        if abs(n[1]) < 0.97: continue
        for p in (SP[k].mean(0), (SP[k][0] + SP[k][1]) / 2, (SP[k][1] + SP[k][2]) / 2, (SP[k][0] + SP[k][2]) / 2):
            cg.setdefault((int(p[0] // cell), int(p[2] // cell)), []).append(p[1])
    best = None
    for (ix, iz), ys in cg.items():
        px, pz = ix * cell + cell / 2, iz * cell + cell / 2
        if (px - cx) ** 2 + (pz - cz) ** 2 > 600 ** 2: continue
        if not all((ix + dx, iz + dz) in cg for dx in (-1, 0, 1) for dz in (-1, 0, 1)): continue
        bh, bl = 0, 0
        for hh in range(24):
            a = hh * math.pi / 12; run = 0
            for s_ in range(1, 60):
                key = (int((px + math.sin(a) * s_ * cell) // cell), int((pz + math.cos(a) * s_ * cell) // cell))
                if key in cg: run = s_
                else: break
            if run > bl: bl, bh = run, a
        sc = bl - 0.02 * math.hypot(px - cx, pz - cz)
        if best is None or sc > best[0]: best = (sc, px, float(np.median(ys)), pz, bh, bl)
    print('spawn candidate', best)
    return {'pos': [best[1], best[2], best[3]], 'yaw': best[4], 'run': best[5] * cell}

def pack_car(src, out):
    g = GLB(src); W = Writer(); items = []
    for i, n, M in g.walk():
        if 'mesh' not in n: continue
        R = np.linalg.inv(M[:3, :3]).T
        for pr in g.j['meshes'][n['mesh']]['primitives']:
            a = pr['attributes']
            P = g.acc(a['POSITION']).astype(np.float64); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            items.append((P, g.acc(a['NORMAL']).astype(np.float64) @ R.T, g.acc(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else np.zeros((len(P), 2)),
                          g.acc(pr['indices']).astype(np.int64).reshape(-1), pr['material']))
    tires = [it for it in items if it[4] == 9][0]
    tp = tires[0]; xc = (tp[:, 0].min() + tp[:, 0].max()) / 2; zm0 = (tp[:, 2].min() + tp[:, 2].max()) / 2
    wheels = {}
    for nm, sx, sz in (('FL', 1, 1), ('FR', -1, 1), ('RL', 1, -1), ('RR', -1, -1)):
        m = ((tp[:, 0] - xc) * sx > 0) & ((tp[:, 2] - zm0) * sz > 0); q = tp[m]
        wheels[nm] = np.array([(q[:, 0].min() + q[:, 0].max()) / 2, (q[:, 1].min() + q[:, 1].max()) / 2, (q[:, 2].min() + q[:, 2].max()) / 2])
    zc = (wheels['FL'][2] + wheels['RL'][2]) / 2
    S = 4.49 / (max(it[0][:, 2].max() for it in items) - min(it[0][:, 2].min() for it in items))
    origin = np.array([xc, 0.0, zc]); rad = (tp[:, 1].max() - tp[:, 1].min()) / 2 * S
    body = []; wp = {k: [] for k in wheels}
    for P, N, U, idx, mat in items:
        if mat in (3, 9):
            tri = idx.reshape(-1, 3); cen = P[tri].mean(1)
            for nm, sx, sz in (('FL', 1, 1), ('FR', -1, 1), ('RL', 1, -1), ('RR', -1, -1)):
                sel = ((cen[:, 0] - xc) * sx > 0) & ((cen[:, 2] - zm0) * sz > 0)
                if not sel.any(): continue
                t = tri[sel]; used, inv = np.unique(t.reshape(-1), return_inverse=True)
                pv = (P[used] - wheels[nm]) * S
                wp[nm].append(W.prim(pv, N[used], U[used], None, inv.astype(np.int64), mat))
        else:
            body.append(W.prim((P - origin) * S, N, U, None, idx, mat))
    texdir = os.path.join(out, 'tex'); mats = []
    for mi, m in enumerate(g.j['materials']):
        pb = m['pbrMetallicRoughness']; d = {'name': m['name'], 'color': pb.get('baseColorFactor', [1, 1, 1, 1]), 'metal': pb.get('metallicFactor', 1.0 if 'metallicFactor' not in pb else pb['metallicFactor']),
                                              'rough': pb.get('roughnessFactor', 1.0), 'mode': 'blend' if m.get('alphaMode') == 'BLEND' else 'opaque',
                                              'coat': 'KHR_materials_clearcoat' in m.get('extensions', {})}
        if 'baseColorTexture' in pb:
            t = pb['baseColorTexture']['index']; tex_out(g, t, os.path.join(texdir, 'car_%d' % t), 'rgb'); d['tex'] = 'tex/car_%d.jpg' % t
        mats.append(d)
    wj = {k: {'pivot': [float(x) for x in ((wheels[k] - origin) * S)], 'prims': wp[k]} for k in wheels}
    man = {'body': body, 'wheels': wj, 'mats': mats, 'radius': float(rad), 'length': 4.49,
           'width': float((max(it[0][:, 0].max() for it in items) - min(it[0][:, 0].min() for it in items)) * S)}
    open(os.path.join(out, 'car.wasm'), 'wb').write(W.buf); json.dump(man, open(os.path.join(out, 'car.json'), 'w'), separators=(',', ':'))
    print('car.wasm', len(W.buf) // 1024, 'KB radius', rad, 'wheels', {k: v['pivot'] for k, v in wj.items()}, 'width', man['width'])

if __name__ == '__main__':
    city, out = sys.argv[1:3]; os.makedirs(os.path.join(out, 'tex'), exist_ok=True)
    pack_city(city, out)
