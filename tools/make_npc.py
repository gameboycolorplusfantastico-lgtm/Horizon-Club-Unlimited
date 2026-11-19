#!/usr/bin/env python3
"""Converte os packs de carros de trafego (NPC) para assets/npc/ (npc.json + npc.wasm + tex/).
Uso: python3 tools/make_npc.py pack_asphalt.glb pack_traffic.glb police.glb
Cada carro vira: carroceria + rodas (pivo = centro da roda; giram em X). Frente = +Z, origem = centro da carroceria no chao.
Pecas 'glows' (flares de luz do Asphalt 8) sao descartadas."""
import sys, os, io, re, json
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from glbpy import GLB
from pack import Writer

def parts_of(g):
    out = []
    for i, n, M in g.walk():
        if 'mesh' not in n: continue
        R = np.linalg.inv(M[:3, :3]).T
        for pr in g.j['meshes'][n['mesh']]['primitives']:
            a = pr['attributes']; P = g.acc(a['POSITION']).astype(np.float64); P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            N = g.acc(a['NORMAL']).astype(np.float64) @ R.T if 'NORMAL' in a else np.tile([0., 1., 0.], (len(P), 1))
            U = g.acc(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else np.zeros((len(P), 2))
            idx = g.acc(pr['indices']).astype(np.int64).reshape(-1) if 'indices' in pr else np.arange(len(P))
            out.append({'name': n.get('name', ''), 'P': P, 'N': N, 'U': U, 'idx': idx, 'mat': pr.get('material', 0), 'g': g})
    return out

def cluster(parts, is_body):
    bodies = [p for p in parts if is_body(p)]
    cx = [(p['P'][:, 0].min() + p['P'][:, 0].max()) / 2 for p in bodies]
    groups = [[b] for b in bodies]
    for p in parts:
        if p in bodies: continue
        c = (p['P'][:, 0].min() + p['P'][:, 0].max()) / 2
        k = int(np.argmin([abs(c - x) for x in cx])); groups[k].append(p)
    return groups

def main():
    packs = sys.argv[1:]
    out = os.path.join(ROOT, 'assets', 'npc'); os.makedirs(os.path.join(out, 'tex'), exist_ok=True)
    W = Writer(); models = []; texcache = {}
    def tex(g, ti):
        key = (id(g), ti)
        if key in texcache: return texcache[key]
        t = g.j['textures'][ti]; im = g.j['images'][t['source']]; I = Image.open(io.BytesIO(g.view(im['bufferView'])))
        if max(I.size) > 512: I.thumbnail((512, 512), Image.LANCZOS)
        name = 'tex/n%d.jpg' % len(texcache)
        alpha = I.mode in ('RGBA', 'LA', 'P') and I.convert('RGBA').split()[3].getextrema()[0] < 250
        if alpha: name = name.replace('.jpg', '.webp'); I.convert('RGBA').save(os.path.join(out, name), quality=82)
        else: I.convert('RGB').save(os.path.join(out, name), quality=82)
        texcache[key] = name; return name
    def add_model(mid, name, kind, g, body, wheels, target_len=None, tag=''):
        allp = body + [w for w in wheels]
        wh = wheels
        if wh: ground = min(w['P'][:, 1].min() for w in wh)
        else: ground = min(p['P'][:, 1].min() for p in body)
        P = np.concatenate([p['P'] for p in body + wh])
        S = target_len / (P[:, 2].max() - P[:, 2].min()) if target_len else 1.0
        o = np.array([(P[:, 0].min() + P[:, 0].max()) / 2, ground, (P[:, 2].min() + P[:, 2].max()) / 2])
        mats = []; mm = {}
        def mat(mi):
            if mi in mm: return mm[mi]
            m = g.j['materials'][mi]; pb = m.get('pbrMetallicRoughness', {}); ext = m.get('extensions', {})
            d = {'name': (m.get('name') or 'm%d' % mi).replace(' ', '_'), 'color': pb.get('baseColorFactor', [1, 1, 1, 1]),
                 'metal': min(0.5, pb.get('metallicFactor', 0.3)), 'rough': max(0.35, pb.get('roughnessFactor', 0.6)),
                 'mode': 'blend' if m.get('alphaMode') == 'BLEND' else ('mask' if m.get('alphaMode') == 'MASK' else 'opaque'), 'coat': False}
            if 'baseColorTexture' in pb: d['tex'] = 'npc/' + tex(g, pb['baseColorTexture']['index'])
            mats.append(d); mm[mi] = len(mats) - 1; return mm[mi]
        b = []; 
        for p in body: b.append(W.prim((p['P'] - o) * S, p['N'], p['U'], None, p['idx'], mat(p['mat'])))
        ws = []
        for p in wh:
            c = (p['P'].min(0) + p['P'].max(0)) / 2
            ws.append({'pivot': [float(x) for x in ((c - o) * S)], 'prims': [W.prim((p['P'] - c) * S, p['N'], p['U'], None, p['idx'], mat(p['mat']))],
                       'r': float((p['P'][:, 1].max() - p['P'][:, 1].min()) / 2 * S)})
        bp = np.concatenate([p['P'] for p in body]); dims = (bp.max(0) - bp.min(0)) * S
        models.append({'id': mid, 'name': name, 'kind': kind, 'body': b, 'wheels': ws, 'mats': mats, 'width': float(dims[0]), 'height': float(dims[1]), 'length': float(dims[2])})
        print('%-10s %-22s L%.2f W%.2f H%.2f rodas %d' % (mid, name, dims[2], dims[0], dims[1], len(ws)))
    # --- pack 1 (Asphalt 8): chassis_* + WheelsPair*, ignora glows ---
    g = GLB(packs[0]); ps = [p for p in parts_of(g) if 'glows' not in p['name']]
    gr = cluster(ps, lambda p: p['name'].startswith('chassis_') and 'glass' not in p['name'] and 'carpaint' in p['name'] or p['name'].startswith('chassis_nonwreck'))
    gr.sort(key=lambda G: G[0]['P'][:, 0].mean())
    for i, G in enumerate(gr):
        body = [p for p in G if not p['name'].startswith('Wheels')]; wh = [p for p in G if p['name'].startswith('Wheels')]
        L = body[0]['P'][:, 2].max() - body[0]['P'][:, 2].min()
        kind = 'bus' if L > 12 else ('limo' if L > 8 else ('truck' if L > 6 else 'car'))
        if i == 1: kind = 'police'
        add_model('a8_%02d' % i, 'A8 %d' % i, kind, g, body, wh)
    # --- pack 2 (Traffic Vehicles) ---
    g = GLB(packs[1]); ps = parts_of(g)
    gr = cluster(ps, lambda p: 'Wheel' not in p['name'])
    gr.sort(key=lambda G: G[0]['P'][:, 0].mean())
    for i, G in enumerate(gr):
        body = [p for p in G if 'Wheel' not in p['name']]; wh = [p for p in G if 'Wheel' in p['name']]
        L = body[0]['P'][:, 2].max() - body[0]['P'][:, 2].min()
        add_model('tv_%02d' % i, 'TV %d' % i, 'truck' if body[0]['P'][:, 1].max() > 3 else 'car', g, body, wh)
    # --- policia: tudo estatico (rodas ja fazem parte), escala p/ 4,9 m ---
    g = GLB(packs[2]); ps = parts_of(g)
    wheels_for_ground = [p for p in ps if p['name'] in ('Object_4', 'Object_5', 'Object_6')]
    P = np.concatenate([p['P'] for p in ps]); S = 4.9 / (P[:, 2].max() - P[:, 2].min())
    add_model('police', 'Police', 'police', g, ps, [], target_len=4.9)
    json.dump({'models': models, 'bytes': len(W.buf)}, open(os.path.join(out, 'npc.json'), 'w'), separators=(',', ':'))
    open(os.path.join(out, 'npc.wasm'), 'wb').write(W.buf)
    print('npc.wasm %d KB, %d modelos' % (len(W.buf) // 1024, len(models)))
main()
