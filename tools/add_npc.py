#!/usr/bin/env python3
"""Converte os packs de carros de NPC (GLB) em assets/npc/<id>/ + assets/npc/npc.json.

Uso:  python3 tools/add_npc.py PACK_ASPHALT.glb PACK_TRAFFIC.glb POLICIA.glb
      (os nomes dos arquivos sao reconhecidos pelo conteudo; a ordem nao importa)

Cada veiculo vira car.json + car.wasm (mesmo formato dos carros jogaveis: carroceria + 4 rodas FL/FR/RL/RR) + tex/.
Escala, origem (chao, entre os eixos), +Z frente, +X esquerda. Eixos extras (caminhoes) ficam fixos na carroceria.
Para ajustar comprimento real, nome ou tipo de um veiculo, edite as tabelas PACK1 / PACK2 / POLICE abaixo e rode de novo.
"""
import sys, os, re, json
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from glbpy import GLB
from pack import Writer
import add_car as AC

OUT = os.path.join(ROOT, 'assets', 'npc')
TEX = 512

# id, nome, tipo, grupo no GLB, comprimento real (m), peso para sorteio
PACK1 = [
    ('sedan',      'Sedan',          'car',    'traffic_car1_nonwreck',        4.75, 5),
    ('economy',    'Compacto',       'car',    'traffic_economy_nonwreck',     4.05, 5),
    ('taxi',       'Taxi',           'taxi',   'traffic_generictaxi_nonwreck', 4.80, 2),
    ('limo',       'Limusine',       'car',    'traffic_limo_nonwreck',        7.00, 0.4),
    ('pickup',     'Picape',         'car',    'traffic_pickup_nonwreck',      5.00, 2),
    ('pickup2',    'Picape grande',  'car',    'traffic_pickup2_nonwreck',     5.60, 1.5),
    ('suv',        'SUV',            'car',    'traffic_suv_nonwreck',         4.70, 3),
    ('police-a8',  'Viatura',        'police', 'traffic_police_nonwreck',      4.90, 0),
    ('boxtruck',   'Caminhao bau',   'truck',  'traffic_truck_nonwreck',       7.50, 0.8),
    ('cabtruck',   'Caminhao',       'truck',  'traffic_big_truck_nonwreck',   7.50, 0.5),
    ('bus',        'Onibus',         'bus',    'traffic_bus_nonwreck',        11.50, 0.6),
]
# pack 2: veiculos lado a lado em X (0,5,10,...): (id, nome, tipo, x do centro, comprimento real, peso)
PACK2 = [
    ('t2-hatch',   'Hatch',      'car',   30, 4.20, 3),
    ('t2-wagon',   'Perua',      'car',   25, 4.60, 2),
    ('t2-van',     'Van',        'car',   20, 4.90, 1.5),
    ('t2-sedan',   'Sedan 2',    'car',   15, 4.80, 3),
    ('t2-truck',   'Caminhao 2', 'truck', 10, 8.00, 0.6),
    ('t2-compact', 'Compacto 2', 'car',    5, 4.10, 3),
    ('t2-coupe',   'Cupe',       'car',    0, 4.60, 2),
]
POLICE = ('police', 'Viatura (policia)', 'police', 4.90)


def split_pair(p, xc):
    """peca que cobre o eixo todo (par de rodas) -> (esquerda, direita) pelo centro dos triangulos"""
    tri = p['idx'].reshape(-1, 3); cen = p['P'][tri].mean(1)
    out = []
    for sel in (cen[:, 0] > xc, cen[:, 0] <= xc):
        if not sel.any(): out.append(None); continue
        t = tri[sel]; used, inv = np.unique(t.reshape(-1), return_inverse=True)
        out.append({'name': p['name'], 'path': p['path'], 'P': p['P'][used], 'N': p['N'][used], 'U': p['U'][used], 'idx': inv.astype(np.int64), 'mat': p['mat']})
    return out


def sub(p, sel_fn):
    tri = p['idx'].reshape(-1, 3)
    return None


def build(g, vid, name, kind, parts, wheel_sel, length, weight, outroot, mat_paint=None, forward_sign=1):
    """parts: pecas do veiculo; wheel_sel: dict {'FL':[pecas],'FR':..,'RL':..,'RR':..}; resto = carroceria"""
    wheel_ids = {id(x) for v in wheel_sel.values() for x in v}
    body = [p for p in parts if id(p) not in wheel_ids]
    allp = body + [x for v in wheel_sel.values() for x in v]
    if forward_sign < 0:
        for p in allp:
            p['P'][:, [0, 2]] *= -1; p['N'][:, [0, 2]] *= -1
    zs = np.concatenate([x['P'][:, 2] for x in allp]); xs = np.concatenate([x['P'][:, 0] for x in allp]); ys = np.concatenate([x['P'][:, 1] for x in allp])
    S = length / (zs.max() - zs.min())
    have = all(wheel_sel[k] for k in ('FL', 'FR', 'RL', 'RR'))
    piv = {}; rad = []
    if have:
        for k, v in wheel_sel.items():
            P = np.concatenate([x['P'] for x in v]); mn, mx = P.min(0), P.max(0); piv[k] = (mn + mx) / 2; rad.append((mx[1] - mn[1]) / 2)
        ground = min(piv[k][1] - r for k, r in zip(piv, rad))
        origin = np.array([(xs.min() + xs.max()) / 2, ground, (np.mean([piv['FL'][2], piv['FR'][2]]) + np.mean([piv['RL'][2], piv['RR'][2]])) / 2])
    else:
        origin = np.array([(xs.min() + xs.max()) / 2, ys.min(), (zs.min() + zs.max()) / 2])
    # materiais
    mj = g.j['materials']; used = sorted({p['mat'] for p in allp}); tex_used = set(); tex_blend = set()
    for mi in used:
        m = mj[mi]; pb = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pb:
            tex_used.add(pb['baseColorTexture']['index'])
            if m.get('alphaMode') in ('BLEND', 'MASK'): tex_blend.add(pb['baseColorTexture']['index'])
    outdir = os.path.join(outroot, vid)
    tmap = AC.export_textures(g, outdir, TEX, {'used': tex_used, 'blend': tex_blend})
    mats = []; mmap = {}
    for mi in used:
        m = mj[mi]; pb = m.get('pbrMetallicRoughness', {}); ext = m.get('extensions', {})
        mode = 'blend' if m.get('alphaMode') == 'BLEND' or 'KHR_materials_transmission' in ext else ('mask' if m.get('alphaMode') == 'MASK' else 'opaque')
        nm = (m.get('name') or 'mat%d' % mi).replace(' ', '_')
        if mat_paint is not None and mi == mat_paint: nm = 'npc_paint'
        d = {'name': nm, 'color': pb.get('baseColorFactor', [1, 1, 1, 1]), 'metal': min(0.4, pb.get('metallicFactor', 0.0)), 'rough': max(0.35, pb.get('roughnessFactor', 0.8)), 'mode': mode, 'coat': False}
        if 'baseColorTexture' in pb: d['tex'] = tmap[pb['baseColorTexture']['index']]
        mmap[mi] = len(mats); mats.append(d)
    W = Writer(); bj = []
    for p in body:
        bj.append(W.prim((p['P'] - origin) * S, p['N'], p['U'], None, p['idx'], mmap[p['mat']]))
    wj = {}
    for k in ('FL', 'FR', 'RL', 'RR'):
        if have:
            wj[k] = {'pivot': [float(x) for x in ((piv[k] - origin) * S)], 'prims': [W.prim((x['P'] - piv[k]) * S, x['N'], x['U'], None, x['idx'], mmap[x['mat']]) for x in wheel_sel[k]]}
        else:
            wj[k] = {'pivot': [0.0, 0.3, 0.0], 'prims': []}
    allp_w = (np.concatenate([x['P'] for x in allp]) - origin) * S
    width = float(allp_w[:, 0].max() - allp_w[:, 0].min()); height = float(allp_w[:, 1].max()); L = float(allp_w[:, 2].max() - allp_w[:, 2].min())
    radius = float(np.mean(rad) * S) if have else 0.33
    wb = float((piv['FL'][2] - piv['RL'][2]) * S) if have else 0.6 * L
    hw = float(abs(piv['FL'][0] - piv['FR'][0]) * S / 2) if have else width * 0.42
    # zonas de luz (farol branco na frente, lanterna vermelha atras) nos cantos
    zf = float(allp_w[:, 2].max()) - 0.12; zr = float(allp_w[:, 2].min()) + 0.12; yl = float(min(0.75, 0.55 * height))
    xl = float(width * 0.33)
    man = {'body': bj, 'wheels': wj, 'mats': mats, 'radius': radius, 'length': UNIT_LEN(L), 'width': width,
           'lightZones': {'head': [[xl, yl, zf, 0.22]], 'tail': [[xl, yl + 0.05, zr, 0.18]]}}
    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, 'car.wasm'), 'wb').write(W.buf)
    json.dump(man, open(os.path.join(outdir, 'car.json'), 'w'), separators=(',', ':'))
    print('%-10s %-8s L=%.2f W=%.2f H=%.2f R=%.2f wb=%.2f rodas=%s  %d KB' % (vid, kind, L, width, height, radius, wb, 'sim' if have else 'fixas', len(W.buf) // 1024))
    return {'id': vid, 'name': name, 'kind': kind, 'dir': vid, 'length': round(L, 3), 'width': round(width, 3), 'height': round(height, 3), 'radius': round(radius, 3),
            'wheelbase': round(wb, 3), 'halfTrack': round(hw, 3), 'weight': weight, 'bytes': len(W.buf)}


def UNIT_LEN(L): return L


def pick_paint(parts):
    """material da pintura = o do maior pedaco cujo nome de objeto contem 'carpaint' (pack 1), senao None"""
    c = [p for p in parts if 'carpaint' in p['path'].lower() and 'wheel' not in p['path'].lower()]
    if not c: return None
    return max(c, key=lambda p: len(p['P']))['mat']


def pack1(g, entries):
    allparts = AC.load_parts(g, False); res = []
    for vid, name, kind, grp, length, weight in entries:
        parts = [p for p in allparts if grp in p['path'] and 'glows' not in p['path'].lower()]
        body = [p for p in parts if 'chassis' in p['path'].lower() and 'wheel' not in p['path'].lower()]
        xc = np.concatenate([p['P'] for p in body])[:, 0]; xc = (xc.min() + xc.max()) / 2
        pairs = [p for p in parts if 'WheelsPair' in p['path']]
        pairs.sort(key=lambda p: -p['P'][:, 2].mean())
        front = [p for p in pairs if re.search(r'WheelsPair(F|BF)', p['path'])]
        rear = [p for p in pairs if 'WheelsPairB0' in p['path']]
        ws = {'FL': [], 'FR': [], 'RL': [], 'RR': []}; keep = [p for p in parts if p not in pairs]
        extra = [p for p in pairs if p not in front and p not in rear]
        for lst, (l, r) in ((front, ('FL', 'FR')), (rear, ('RL', 'RR'))):
            for p in lst:
                a, b = split_pair(p, xc)
                if a: ws[l].append(a)
                if b: ws[r].append(b)
        res.append(build(g, vid, name, kind, keep + extra + [x for v in ws.values() for x in v], ws, length, weight, OUT, pick_paint(parts)))
    return res


def pack2(g, entries):
    allparts = AC.load_parts(g, False); res = []
    for vid, name, kind, xcen, length, weight in entries:
        parts = [p for p in allparts if abs(p['P'][:, 0].mean() - xcen) < 2.4 and p['P'][:, 0].min() > xcen - 3.0 and p['P'][:, 0].max() < xcen + 3.0]
        ws = {'FL': [], 'FR': [], 'RL': [], 'RR': []}
        for p in parts:
            m = re.search(r'Wheel(FL|FR|RL|RR)', p['path'])
            if m: ws[m.group(1)].append(p)
        body = [p for p in parts if 'Wheel' not in p['path'].split('/')[0] and not re.search(r'Wheel(FL|FR|RL|RR)', p['path'])]
        paint = max([p for p in parts if 'Body' in p['path'].split('/')[-1] or 'Body' in p['path']], key=lambda p: len(p['P']), default=None)
        parts2 = body + [x for v in ws.values() for x in v]
        # nomes dos grupos de roda (WheelColliders = eixos extras, ficam na carroceria)
        res.append(build(g, vid, name, kind, parts2, ws, length, weight, OUT, paint['mat'] if paint else None))
    return res


def police(g):
    parts = AC.load_parts(g, False)
    # o arquivo original e Z-up com escala estranha; o no raiz ja gira para Y-up. Rodas = pecas pequenas e redondas, ficam fixas (low-poly)
    return [build(g, POLICE[0], POLICE[1], POLICE[2], parts, {'FL': [], 'FR': [], 'RL': [], 'RR': []}, POLICE[3], 0, OUT, None)]


def main():
    files = sys.argv[1:]
    if not files: sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True); reg = []
    for f in files:
        g = GLB(f); names = ' '.join(n.get('name', '') for n in g.j['nodes'])
        if 'traffic_big_truck' in names: reg += pack1(g, PACK1)
        elif 'M_TrafficCar' in names: reg += pack2(g, PACK2)
        elif len(g.j['meshes']) <= 8: reg += police(g)
        else: print('arquivo nao reconhecido:', f)
    json.dump({'vehicles': reg}, open(os.path.join(OUT, 'npc.json'), 'w'), indent=1)
    print(len(reg), 'veiculos em', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
