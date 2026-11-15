#!/usr/bin/env python3
"""Processa todos os .glb da pasta novos-carros/: empacota para o jogo, registra em assets/cars/cars.json e apaga o .glb.

Opcional: ao lado de meu-carro.glb, um meu-carro.json com ajustes (todos os campos sao opcionais):
  {"name": "Nome no menu", "id": "meu-carro", "brand": "Marca", "class": "Esportivo", "scale": 1.2,
   "preset": "esportivo", "specs": "V6 · 300 cv", "wheel_nodes": "regex", "drop": "regex",
   "brake_nodes": "glass_red", "rotate_y": 180, "tex_size": 1024, "wheel_mode": "auto|name|path|geom"}
Sem o .json, o nome vem do nome do arquivo e vale o preset "esportivo" com escala 1.2.

DADOS REAIS: por padrao o robo pesquisa na internet a potencia, o peso, a tracao e a velocidade maxima do carro
(pelo "name", ou por "busca": "Ford F-150 Raptor 2010" se quiser ser mais especifico) e ajusta a fisica a eles.
  "buscar_dados": false     -> desliga a pesquisa
  "real": {"hp": 411, "kg": 2650, "awd": true, "top_kmh": 170, "cyl": 8}   -> forca valores (tem prioridade)
"""
import glob, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import specs_reais

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PASTA = os.path.join(ROOT, 'novos-carros')
FLAGS = {'brand': '--brand', 'class': '--class', 'scale': '--scale', 'length': '--length', 'preset': '--preset', 'specs': '--specs',
         'wheel_nodes': '--wheel-nodes', 'drop': '--drop', 'brake_nodes': '--brake-nodes', 'rotate_y': '--rotate-y', 'tex_size': '--tex-size', 'wheel_mode': '--wheel-mode'}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'carro'


def ajustar_com_dados_reais(car_id, cfg, nome):
    reg_path = os.path.join(ROOT, 'assets', 'cars', 'cars.json')
    reg = json.load(open(reg_path, encoding='utf-8'))
    car = next(c for c in reg['cars'] if c['id'] == car_id)
    real = specs_reais.buscar(cfg.get('busca') or nome, cfg.get('real'))
    if not real:
        print('  nenhum dado real encontrado; mantendo o preset'); return
    presets = json.load(open(os.path.join(ROOT, 'tools', 'presets.json'), encoding='utf-8'))
    preset = presets.get(cfg.get('preset') or 'esportivo', presets['esportivo'])
    raio = None
    try:
        raio = json.load(open(os.path.join(ROOT, 'assets', 'cars', car_id, 'car.json')))['radius'] * car['scale']
    except Exception:
        pass
    P, cyl, specs = specs_reais.aplicar(preset, real, raio)
    car['params'], car['cyl'] = P, cyl
    if not cfg.get('specs') and specs:
        car['specs'] = specs
    json.dump(reg, open(reg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('  dados reais aplicados (%s): %s' % (real.get('fonte', 'manual'), specs))


def main():
    glbs = sorted(glob.glob(os.path.join(PASTA, '*.glb')) + glob.glob(os.path.join(PASTA, '*.GLB')))
    if not glbs:
        print('Nenhum .glb em novos-carros/. Nada a fazer.'); return 0
    falhas = []
    for glb in glbs:
        stem = os.path.splitext(os.path.basename(glb))[0]
        side = os.path.join(PASTA, stem + '.json'); cfg = {}
        if os.path.exists(side):
            try:
                cfg = json.load(open(side, encoding='utf-8'))
            except Exception as e:
                print('ERRO lendo', side, e); falhas.append(stem); continue
        cfg.setdefault('brake_nodes', 'glass_red|brake_?light')
        cmd = [sys.executable, os.path.join(ROOT, 'tools', 'add_car.py'), glb, '--id', cfg.get('id') or slug(stem),
               '--name', cfg.get('name') or re.sub(r'[_\-]+', ' ', stem).strip().title()]
        for k, flag in FLAGS.items():
            if cfg.get(k) not in (None, ''):
                cmd += [flag, str(cfg[k])]
        print('==>', stem); print(' '.join(cmd))
        if subprocess.call(cmd, cwd=ROOT) != 0:
            falhas.append(stem); continue
        if cfg.get('buscar_dados', True):
            try:
                ajustar_com_dados_reais(cfg.get('id') or slug(stem), cfg, cfg.get('name') or re.sub(r'[_\-]+', ' ', stem).strip().title())
            except Exception as e:  # nunca derruba o carro por causa da pesquisa
                print('  [aviso] ajuste por dados reais falhou:', e)
        for f in (glb, side):
            if os.path.exists(f):
                os.remove(f)
    if falhas:
        print('\nFALHARAM:', ', '.join(falhas), '\nDica: envie um', '<nome>.json', 'com "wheel_nodes" ou "rotate_y" e tente de novo.'); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
