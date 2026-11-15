#!/usr/bin/env python3
"""Adiciona (ou atualiza) um carro no Horizon Club Unlimited a partir de um arquivo .glb.

Uso basico:
    python3 tools/add_car.py MEU_CARRO.glb --id ford-f150-raptor --name "Ford F-150 SVT Raptor" \
        --brand Ford --class Pickup --scale 1.225 --preset pickup --specs "V8 6.2 · 411 cv · 4x4"

O que o script faz:
  1. le o GLB, aplica as transformacoes dos nos e acha as 4 rodas (pelo nome dos objetos);
  2. normaliza o carro para 4,49 m de comprimento, origem no chao entre os eixos (+Z frente, +X esquerda);
  3. grava assets/cars/<id>/car.json, car.wasm e tex/ (texturas reduzidas);
  4. registra o carro em assets/cars/cars.json -> ele aparece sozinho no menu do jogo.

Se o carro vier virado para tras, use --rotate-y 180. Para ver os nomes das pecas e quais viraram roda: --report.
"""
import sys, os, io, re, json, argparse
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from glbpy import GLB
from pack import Writer

UNIT_LEN = 4.49  # comprimento de referencia do formato (o jogo multiplica por "scale")
WHEEL_DEFAULT = r'(?i)(?<![a-z])(wheel|tyre|tire|rim|rotor|hub|brake_?disc)'


def load_parts(g, flip):
    parts = []
    for i, n, M in g.walk():
        if 'mesh' not in n:
            continue
        R = np.linalg.inv(M[:3, :3]).T
        for pr in g.j['meshes'][n['mesh']]['primitives']:
            a = pr['attributes']
            P = g.acc(a['POSITION']).astype(np.float64)
            P = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            N = g.acc(a['NORMAL']).astype(np.float64) @ R.T if 'NORMAL' in a else np.tile([0.0, 1.0, 0.0], (len(P), 1))
            U = g.acc(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else np.zeros((len(P), 2))
            idx = g.acc(pr['indices']).astype(np.int64).reshape(-1) if 'indices' in pr else np.arange(len(P))
            if flip:
                P[:, [0, 2]] *= -1
                N[:, [0, 2]] *= -1
            parts.append({'name': n.get('name', ''), 'P': P, 'N': N, 'U': U, 'idx': idx, 'mat': pr.get('material', 0)})
    return parts


def quad_name(sx, sz):
    return {(1, 1): 'FL', (-1, 1): 'FR', (1, -1): 'RL', (-1, -1): 'RR'}[(sx, sz)]


def export_textures(g, outdir, texmax, blend_tex):
    """Exporta cada textura uma vez. Retorna {indice_textura: nome_arquivo_relativo}."""
    os.makedirs(os.path.join(outdir, 'tex'), exist_ok=True)
    out = {}
    for ti, t in enumerate(g.j.get('textures', [])):
        if ti not in blend_tex['used']:
            continue
        im = g.j['images'][t['source']]
        I = Image.open(io.BytesIO(g.view(im['bufferView'])))
        if max(I.size) > texmax:
            I.thumbnail((texmax, texmax), Image.LANCZOS)
        has_alpha = False
        if I.mode in ('RGBA', 'LA', 'P'):
            A = I.convert('RGBA').split()[3]
            has_alpha = A.getextrema()[0] < 250
        base = os.path.join(outdir, 'tex', 'car_%d' % ti)
        if has_alpha and ti in blend_tex['blend']:
            I.convert('RGBA').save(base + '.webp', quality=85, method=6); out[ti] = 'tex/car_%d.webp' % ti
        else:
            I.convert('RGB').save(base + '.jpg', quality=84, optimize=True); out[ti] = 'tex/car_%d.jpg' % ti
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('glb')
    ap.add_argument('--id', required=True, help='nome curto sem espacos (vira a pasta assets/cars/<id>)')
    ap.add_argument('--name', required=True, help='nome exibido no menu')
    ap.add_argument('--brand', default='')
    ap.add_argument('--class', dest='klass', default='', help='categoria exibida (Esportivo, Pickup, SUV...)')
    ap.add_argument('--scale', type=float, default=None, help='escala no jogo; comprimento final = 4,49 x scale (ex.: 1.225 = 5,5 m)')
    ap.add_argument('--length', type=float, default=None, help='alternativa ao --scale: comprimento real em metros')
    ap.add_argument('--preset', default='esportivo', help='fisica base de tools/presets.json (esportivo, pickup)')
    ap.add_argument('--specs', default='', help='texto curto de ficha tecnica no menu')
    ap.add_argument('--wheel-nodes', default=WHEEL_DEFAULT, help='regex dos nomes de objetos que fazem parte das rodas')
    ap.add_argument('--drop', default='', help='regex extra de pecas a descartar (deixa o carro mais leve)')
    ap.add_argument('--brake-nodes', default='', help='regex das pecas que acendem ao frear (lanternas vermelhas)')
    ap.add_argument('--rotate-y', type=int, default=0, choices=[0, 180], help='use 180 se o carro estiver virado para tras')
    ap.add_argument('--tex-size', type=int, default=1024, help='lado maximo das texturas')
    ap.add_argument('--report', action='store_true', help='so lista as pecas e as rodas encontradas, sem gravar nada')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'cars'))
    a = ap.parse_args()

    g = GLB(a.glb)
    parts = load_parts(g, a.rotate_y == 180)
    drop_re = re.compile(r'(?i)caliper|undercarriage' + ('|' + a.drop if a.drop else ''))
    n0 = len(parts); parts = [p for p in parts if not drop_re.search(p['name'])]
    print('pecas:', len(parts), '(descartadas', n0 - len(parts), ')')

    # ---- rodas ----
    wre = re.compile(a.wheel_nodes)
    cand = [p for p in parts if wre.search(p['name']) and not re.search(r'(?i)steer', p['name'])]
    if not cand:
        sys.exit('Nenhuma peca de roda encontrada. Use --report e ajuste --wheel-nodes.')
    allP = np.concatenate([p['P'] for p in cand])
    xc = (allP[:, 0].min() + allP[:, 0].max()) / 2; zc = (allP[:, 2].min() + allP[:, 2].max()) / 2
    wparts = {k: [] for k in ('FL', 'FR', 'RL', 'RR')}
    cand_ids = {id(p) for p in cand}
    body_parts = [p for p in parts if id(p) not in cand_ids]
    for p in cand:
        tri = p['idx'].reshape(-1, 3); cen = p['P'][tri].mean(1)
        for sx in (1, -1):
            for sz in (1, -1):
                sel = ((cen[:, 0] - xc) * sx > 0) & ((cen[:, 2] - zc) * sz > 0)
                if not sel.any():
                    continue
                t = tri[sel]; used, inv = np.unique(t.reshape(-1), return_inverse=True)
                wparts[quad_name(sx, sz)].append({'name': p['name'], 'P': p['P'][used], 'N': p['N'][used], 'U': p['U'][used], 'idx': inv.astype(np.int64), 'mat': p['mat']})
    if a.report:
        for p in parts:
            tag = 'RODA' if id(p) in cand_ids else '    '
            print(tag, '%-70s' % p['name'][:70], 'verts', len(p['P']), 'mat', p['mat'])
        for k, v in wparts.items():
            print(k, 'pecas', len(v), 'verts', sum(len(x['P']) for x in v))
        return
    if any(len(v) == 0 for v in wparts.values()):
        sys.exit('Nao achei as 4 rodas: ' + str({k: len(v) for k, v in wparts.items()}) + '. Use --report e ajuste --wheel-nodes.')

    # ---- geometria das rodas: pivo = centro do pneu (a peca de maior diametro) ----
    piv = {}; rad = []
    for k, v in wparts.items():
        tire = max(v, key=lambda x: x['P'][:, 1].max() - x['P'][:, 1].min())
        mn, mx = tire['P'].min(0), tire['P'].max(0); piv[k] = (mn + mx) / 2; rad.append((mx[1] - mn[1]) / 2)
    ground = min(piv[k][1] - r for k, r in zip(piv, rad))
    xcar = np.mean([piv[k][0] for k in piv]); zcar = (np.mean([piv['FL'][2], piv['FR'][2]]) + np.mean([piv['RL'][2], piv['RR'][2]])) / 2
    origin = np.array([xcar, ground, zcar])
    kept = body_parts + [x for v in wparts.values() for x in v]
    zs = np.concatenate([x['P'][:, 2] for x in kept]); xs = np.concatenate([x['P'][:, 0] for x in kept])
    S = UNIT_LEN / (zs.max() - zs.min())
    radius = float(np.mean(rad) * S)

    # ---- escala do jogo ----
    scale = a.scale if a.scale else (a.length / UNIT_LEN if a.length else 1.2)

    # ---- materiais ----
    mats_gltf = g.j['materials']
    mat_used = sorted({p['mat'] for p in kept})
    brake_re = re.compile(a.brake_nodes) if a.brake_nodes else None
    mats = []; mat_map = {}; brake_map = {}
    blend_idx = set(); tex_used = set(); tex_blend = set()
    for mi in mat_used:
        m = mats_gltf[mi]; pb = m.get('pbrMetallicRoughness', {}); ext = m.get('extensions', {})
        mode = 'blend' if m.get('alphaMode') == 'BLEND' or 'KHR_materials_transmission' in ext else 'opaque'
        if 'baseColorTexture' in pb:
            tex_used.add(pb['baseColorTexture']['index'])
            if mode == 'blend':
                tex_blend.add(pb['baseColorTexture']['index'])
    tmap = export_textures(g, os.path.join(a.out, a.id), a.tex_size, {'used': tex_used, 'blend': tex_blend})

    def add_mat(mi, brake=False):
        m = mats_gltf[mi]; pb = m.get('pbrMetallicRoughness', {}); ext = m.get('extensions', {})
        d = {'name': (m.get('name') or 'mat%d' % mi).replace(' ', '_') + ('_detailglassred' if brake else ''),
             'color': pb.get('baseColorFactor', [1, 1, 1, 1]), 'metal': pb.get('metallicFactor', 1.0), 'rough': pb.get('roughnessFactor', 1.0),
             'mode': 'blend' if m.get('alphaMode') == 'BLEND' or 'KHR_materials_transmission' in ext else 'opaque', 'coat': 'KHR_materials_clearcoat' in ext}
        if 'baseColorTexture' in pb:
            d['tex'] = tmap[pb['baseColorTexture']['index']]
        if brake:
            d['brake'] = True
        mats.append(d); return len(mats) - 1
    for mi in mat_used:
        mat_map[mi] = add_mat(mi)

    # ---- grava ----
    W = Writer(); body = []; wj = {}
    for p in body_parts:
        mid = mat_map[p['mat']]
        if brake_re and brake_re.search(p['name']):
            if p['mat'] not in brake_map:
                brake_map[p['mat']] = add_mat(p['mat'], True)
            mid = brake_map[p['mat']]
        body.append(W.prim((p['P'] - origin) * S, p['N'], p['U'], None, p['idx'], mid))
    for k, v in wparts.items():
        wj[k] = {'pivot': [float(x) for x in ((piv[k] - origin) * S)], 'prims': [W.prim((x['P'] - piv[k]) * S, x['N'], x['U'], None, x['idx'], mat_map[x['mat']]) for x in v]}
    width = float((xs.max() - xs.min()) * S)
    man = {'body': body, 'wheels': wj, 'mats': mats, 'radius': radius, 'length': UNIT_LEN, 'width': width}
    outdir = os.path.join(a.out, a.id); os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, 'car.wasm'), 'wb').write(W.buf)
    json.dump(man, open(os.path.join(outdir, 'car.json'), 'w'), separators=(',', ':'))
    tris = (sum(p['ni'] for p in body) + sum(p['ni'] for w in wj.values() for p in w['prims'])) // 3
    print('car.wasm %d KB | %d triangulos | raio da roda %.3f | largura %.2f | distancia entre eixos (unid.) %.3f' % (len(W.buf) // 1024, tris, radius, width, 2 * wj['FL']['pivot'][2]))

    # ---- registro ----
    presets = json.load(open(os.path.join(HERE, 'presets.json'), encoding='utf-8'))
    if a.preset not in presets:
        sys.exit('preset desconhecido: ' + a.preset + ' (opcoes: ' + ', '.join(presets) + ')')
    reg_path = os.path.join(a.out, 'cars.json')
    reg = json.load(open(reg_path, encoding='utf-8')) if os.path.exists(reg_path) else {'cars': []}
    entry = {'id': a.id, 'name': a.name, 'brand': a.brand, 'class': a.klass, 'dir': a.id, 'scale': round(scale, 4), 'specs': a.specs,
             'cyl': presets[a.preset].get('cyl', 6), 'params': presets[a.preset]['params'], 'bytes': len(W.buf), 'tris': tris}
    old = next((c for c in reg['cars'] if c['id'] == a.id), None)
    if old:  # preserva ajustes manuais de fisica ja feitos no cars.json
        for key in ('params', 'cyl', 'specs', 'brand', 'class', 'name', 'scale'):
            if old.get(key) not in (None, '', {}) and getattr(a, key if key != 'class' else 'klass', None) in (None, '', {}):
                entry[key] = old[key]
        reg['cars'][reg['cars'].index(old)] = entry
    else:
        reg['cars'].append(entry)
    json.dump(reg, open(reg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('registrado em', os.path.relpath(reg_path, ROOT), '->', len(reg['cars']), 'carro(s) no jogo')


if __name__ == '__main__':
    main()
