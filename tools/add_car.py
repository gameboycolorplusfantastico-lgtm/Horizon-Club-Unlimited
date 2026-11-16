#!/usr/bin/env python3
"""Adiciona (ou atualiza) um carro no Horizon Club Unlimited a partir de um arquivo .glb.

Uso basico:
    python3 tools/add_car.py MEU_CARRO.glb --id ford-f150-raptor --name "Ford F-150 SVT Raptor" \
        --brand Ford --class Pickup --scale 1.225 --preset pickup --specs "V8 6.2 · 411 cv · 4x4"

O que o script faz:
  1. le o GLB, aplica as transformacoes dos nos e acha as 4 rodas (pelo nome do objeto; se nao achar, pelo nome dos
     grupos pai, ex.: W1/wheel_104/Object_88; se ainda nao achar, pela GEOMETRIA: pecas redondas e finas nos 4 cantos);
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


def node_paths(g):
    """Devolve f(i) -> 'avo/pai/no' (nomes da hierarquia). Muitos GLB (Sketchfab) so deixam o nome util nos nos pai."""
    N = g.j['nodes']; parent = {}
    for i, n in enumerate(N):
        for c in n.get('children', []):
            parent[c] = i
    def path(i):
        out = []
        while i is not None:
            out.append(N[i].get('name', '')); i = parent.get(i)
        return '/'.join(reversed(out))
    return path


def load_parts(g, flip):
    parts = []
    pathf = node_paths(g)
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
            parts.append({'name': n.get('name', ''), 'path': pathf(i), 'P': P, 'N': N, 'U': U, 'idx': idx, 'mat': pr.get('material', 0)})
    return parts


def split_wheels(parts):
    """Para modelos com as rodas FUNDIDAS em pecas grandes: separa por componentes conectados (malha soldada por posicao).
    Acha os 4 componentes em formato de roda (redondos no plano y-z, finos em x, nos cantos) e leva para as rodas tambem
    tudo que estiver perto do centro dessas rodas (disco, pinca). As pecas viram 'wheel_split' e entram no fluxo normal."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    comps = []
    allz = np.concatenate([p['P'][:, 2] for p in parts]); sc = 4.5 / max(1e-9, allz.max() - allz.min())  # unidades do arquivo -> metros
    for pi, p in enumerate(parts):
        P = p['P'] * sc; tri = p['idx'].reshape(-1, 3)
        key = np.round(P * 200).astype(np.int64); _, w = np.unique(key, axis=0, return_inverse=True); w = w.reshape(-1); t = w[tri]; n = int(w.max()) + 1
        A = coo_matrix((np.ones(len(t) * 3), (t.reshape(-1), np.roll(t, 1, 1).reshape(-1))), shape=(n, n))
        nc, lab = connected_components(A, directed=False); tl = lab[t[:, 0]]
        for c in np.unique(tl):
            m = tl == c; V = P[tri[m].reshape(-1)]; mn, mx = V.min(0), V.max(0)
            comps.append({'pi': pi, 'mask': m, 'mn': mn, 'mx': mx, 'c': (mn + mx) / 2, 'sz': mx - mn})
    xs = np.concatenate([p['P'][:, 0] for p in parts]) * sc; xc0 = (xs.min() + xs.max()) / 2
    cand = [c for c in comps if 0.45 < c['sz'][1] < 1.0 and 0.45 < c['sz'][2] < 1.0 and abs(c['sz'][1] - c['sz'][2]) < 0.12 and 0.12 < c['sz'][0] < 0.5 and abs(c['c'][0] - xc0) > 0.5]
    cand.sort(key=lambda c: -(c['sz'][1] * c['sz'][2]))
    cent = []
    for c in cand:
        if all(np.hypot(c['c'][0] - q[0], c['c'][2] - q[2]) > 0.3 for q in cent): cent.append(c['c'])
    if len(cent) > 4:  # sobra (estepe, peca redonda extra): fica com as 4 maiores, que formam um retangulo nos cantos
        cent = cent[:4]
    if len(cent) != 4 or sum(q[0] > xc0 for q in cent) != 2:
        print('split-wheels: achei', len(cent), 'rodas (esperava 4)', [np.round(q, 2).tolist() for q in cent]); return parts
    out = []; nw = 0
    for pi, p in enumerate(parts):
        mine = [c for c in comps if c['pi'] == pi]; wmask = np.zeros(len(p['idx']) // 3, bool)
        for c in mine:
            if any(abs(c['c'][0] - q[0]) < 0.35 and abs(c['c'][1] - q[1]) < 0.35 and abs(c['c'][2] - q[2]) < 0.35 for q in cent) and max(c['sz']) < 1.0:
                wmask |= c['mask']
        tri = p['idx'].reshape(-1, 3)
        for sel, nm in ((wmask, 'wheel_split ' + p['name']), (~wmask, p['name'])):
            if not sel.any(): continue
            t = tri[sel]; used, inv = np.unique(t.reshape(-1), return_inverse=True)
            out.append({'name': nm, 'path': p['path'], 'P': p['P'][used], 'N': p['N'][used], 'U': p['U'][used], 'idx': inv.astype(np.int64), 'mat': p['mat']})
            if sel is wmask: nw += 1
    print('split-wheels: rodas separadas em', nw, 'pecas'); return out


def quad_name(sx, sz):
    return {(1, 1): 'FL', (-1, 1): 'FR', (1, -1): 'RL', (-1, -1): 'RR'}[(sx, sz)]


def geom_wheels(parts, drop_re=None):
    """Acha as rodas pela forma, sem depender de nomes. Pneu = peca redonda (vista de lado), fina, longe do eixo central e
    encostada no chao, um em cada canto do carro. Depois junta aros, discos e parafusos que estao dentro de cada pneu."""
    bb = [(p['P'].min(0), p['P'].max(0)) for p in parts]
    if not bb:
        return []
    allmn = np.min([b[0] for b in bb], 0); allmx = np.max([b[1] for b in bb], 0)
    L = allmx[2] - allmn[2]; W = allmx[0] - allmn[0]; xc = (allmn[0] + allmx[0]) / 2
    if L <= 0:
        return []
    seeds = []
    for k, (mn, mx) in enumerate(bb):
        dx, dy, dz = mx - mn
        if not (0.09 * L <= dy <= 0.24 * L and 0.8 <= dy / max(dz, 1e-9) <= 1.25 and dx <= 0.75 * dy):
            continue
        if abs((mn[0] + mx[0]) / 2 - xc) < 0.25 * W:
            continue
        seeds.append(k)
    if not seeds:
        return []
    low = min(bb[k][0][1] for k in seeds)
    seeds = [k for k in seeds if bb[k][0][1] <= low + 0.04 * L]
    cz = np.mean([(bb[k][0][2] + bb[k][1][2]) / 2 for k in seeds])
    quad = {}
    for k in seeds:
        mn, mx = bb[k]; c = (mn + mx) / 2
        q = (1 if c[0] > xc else -1, 1 if c[2] > cz else -1)
        if q not in quad or (mx[1] - mn[1]) > (bb[quad[q]][1][1] - bb[quad[q]][0][1]):
            quad[q] = k
    if len(quad) != 4:
        return []
    wheels = []
    for k in quad.values():
        mn, mx = bb[k]; wheels.append(((mn + mx) / 2, (mx[1] - mn[1]) / 2, (mx[0] - mn[0]) / 2))
    cand = set(seeds)
    for k, (mn, mx) in enumerate(bb):
        if k in cand or (drop_re is not None and drop_re.search(parts[k]['path'])):
            continue  # pinca de freio etc. que nao e pneu: nao entra na roda
        c = (mn + mx) / 2; d = mx - mn
        for tc, r, hw in wheels:
            if (abs(c[0] - tc[0]) <= hw * 1.6 and np.hypot(c[1] - tc[1], c[2] - tc[2]) <= r * 0.9
                    and d[1] <= 2.3 * r and d[2] <= 2.3 * r and d[0] <= 3 * hw):
                cand.add(k); break
    return [parts[k] for k in sorted(cand)]


def find_wheels(parts, a, drop_re):
    """Tenta achar as rodas em 3 niveis. Devolve (pecas_de_roda, como_achou, pecas_atualizadas)."""
    wre = re.compile(a.wheel_nodes); steer = re.compile(r'(?i)steer'); mode = a.wheel_mode
    if mode in ('auto', 'name'):
        cand = [p for p in parts if wre.search(p['name']) and not steer.search(p['name'])]
        if cand:
            return cand, 'nome', parts
    # a partir daqui os nomes das pecas nao serviram: tambem descarta (caliper etc.) pelo caminho completo
    pp = [p for p in parts if not drop_re.search(p['path'])]
    if mode in ('auto', 'path'):
        cand = [p for p in pp if wre.search(p['path']) and not steer.search(p['path'])]
        # trava: se o "match" pegou quase o modelo inteiro (ex.: um grupo raiz chamado "wheels_and_body"), nao e roda
        if cand and sum(len(p['P']) for p in cand) <= 0.6 * sum(len(p['P']) for p in pp):
            return cand, 'caminho', pp
    if mode in ('auto', 'geom'):
        # geometria olha TODAS as pecas: alguns modelos chamam a roda inteira de "BRAKE_CALIPER_..."; o pneu (forma) vence o nome
        cand = geom_wheels(parts, drop_re)
        if cand:
            ids = {id(p) for p in cand}
            return cand, 'geometria', [p for p in parts if id(p) in ids or not drop_re.search(p['path'])]
    return [], None, parts


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
    ap.add_argument('--wheel-mode', default='auto', choices=['auto', 'name', 'path', 'geom'],
                    help='como achar as rodas: auto (nome -> caminho -> geometria), name, path ou geom')
    ap.add_argument('--drop', default='', help='regex extra de pecas a descartar (deixa o carro mais leve). O fundo do carro (undercarriage) NAO e mais descartado por padrao; use --drop undercarriage se quiser')
    ap.add_argument('--brake-nodes', default='', help='regex das pecas que acendem ao frear (lanternas vermelhas)')
    ap.add_argument('--paint', default='', help='regex dos materiais que sao a PINTURA da carroceria (so se o jogo nao achar sozinho; ver LEIA-ME-PINTURA.md)')
    ap.add_argument('--split-wheels', action='store_true', help='rodas fundidas em pecas grandes: separa as rodas por geometria (componentes conectados)')
    ap.add_argument('--no-paint', action='store_true', help='este carro nao tera troca de cor')
    ap.add_argument('--rotate-y', type=int, default=0, choices=[0, 180], help='use 180 se o carro estiver virado para tras')
    ap.add_argument('--tex-size', type=int, default=1024, help='lado maximo das texturas')
    ap.add_argument('--report', action='store_true', help='so lista as pecas e as rodas encontradas, sem gravar nada')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'cars'))
    a = ap.parse_args()

    g = GLB(a.glb)
    parts = load_parts(g, a.rotate_y == 180)
    drop_re = re.compile(r'(?i)callip|caliper' + ('|' + a.drop if a.drop else ''))
    n0 = len(parts); parts = [p for p in parts if not drop_re.search(p['name'])]
    if a.split_wheels: parts = split_wheels(parts)
    print('pecas:', len(parts), '(descartadas', n0 - len(parts), ')')

    # ---- rodas ----
    n_antes = len(parts)
    cand, how, parts = find_wheels(parts, a, drop_re)
    if how != 'nome' and n_antes != len(parts):
        print('descartadas tambem pelo caminho (pincas etc.):', n_antes - len(parts))
    if not cand:
        sys.exit('Nenhuma peca de roda encontrada (tentei nome, caminho e geometria). Use --report e ajuste --wheel-nodes.')
    print('rodas achadas por', how, '-', len(cand), 'pecas')
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
        if all(wparts.values()):
            for k, v in wparts.items():
                tire = max(v, key=lambda x: x['P'][:, 1].max() - x['P'][:, 1].min())
                mn, mx = tire['P'].min(0), tire['P'].max(0)
                print(k, 'centro', np.round((mn + mx) / 2, 3), 'raio', round(float((mx[1] - mn[1]) / 2), 3))
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
        mode = 'blend' if m.get('alphaMode') == 'BLEND' or 'KHR_materials_transmission' in ext else ('mask' if m.get('alphaMode') == 'MASK' else 'opaque')
        if 'baseColorTexture' in pb:
            tex_used.add(pb['baseColorTexture']['index'])
            if mode in ('blend', 'mask'):  # mask = logo/emblema recortado: a textura precisa guardar o canal alfa
                tex_blend.add(pb['baseColorTexture']['index'])
    tmap = export_textures(g, os.path.join(a.out, a.id), a.tex_size, {'used': tex_used, 'blend': tex_blend})

    def add_mat(mi, brake=False):
        m = mats_gltf[mi]; pb = m.get('pbrMetallicRoughness', {}); ext = m.get('extensions', {})
        d = {'name': (m.get('name') or 'mat%d' % mi).replace(' ', '_') + ('_detailglassred' if brake else ''),
             'color': pb.get('baseColorFactor', [1, 1, 1, 1]), 'metal': pb.get('metallicFactor', 1.0), 'rough': pb.get('roughnessFactor', 1.0),
             'mode': 'blend' if m.get('alphaMode') == 'BLEND' or 'KHR_materials_transmission' in ext else ('mask' if m.get('alphaMode') == 'MASK' else 'opaque'), 'coat': 'KHR_materials_clearcoat' in ext}
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
        if brake_re and (brake_re.search(p['name']) or (how != 'nome' and brake_re.search(p['path']))):
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
    if a.no_paint:
        entry['paint'] = False
    elif a.paint:
        entry['paint'] = {'mats': a.paint}
    old = next((c for c in reg['cars'] if c['id'] == a.id), None)
    if old:  # preserva ajustes manuais de fisica ja feitos no cars.json
        for key in ('params', 'cyl', 'specs', 'brand', 'class', 'name', 'scale'):
            if old.get(key) not in (None, '', {}) and getattr(a, key if key != 'class' else 'klass', None) in (None, '', {}):
                entry[key] = old[key]
        if old.get('paint') is not None and not (a.paint or a.no_paint):  # preserva o ajuste de pintura ja feito
            entry['paint'] = old['paint']
        reg['cars'][reg['cars'].index(old)] = entry
    else:
        reg['cars'].append(entry)
    json.dump(reg, open(reg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('registrado em', os.path.relpath(reg_path, ROOT), '->', len(reg['cars']), 'carro(s) no jogo')


if __name__ == '__main__':
    main()
