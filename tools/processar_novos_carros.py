#!/usr/bin/env python3
"""Processa todos os .glb da pasta novos-carros/: empacota para o jogo, registra em assets/cars/cars.json e apaga o .glb.

Opcional: ao lado de meu-carro.glb, um meu-carro.json com ajustes (todos os campos sao opcionais):
  {"name": "Nome no menu", "id": "meu-carro", "brand": "Marca", "class": "Esportivo", "scale": 1.2,
   "preset": "esportivo", "specs": "V6 · 300 cv", "wheel_nodes": "regex", "drop": "regex",
   "brake_nodes": "glass_red", "rotate_y": 180, "tex_size": 1024, "wheel_mode": "auto|name|path|geom"}
Sem o .json, o nome vem do nome do arquivo e vale o preset "esportivo" com escala 1.2.

TABELA MANUAL (gratis, sem chave): tools/specs_manual.json guarda hp, kg, 4x4, etc. por id de carro. Tem prioridade sobre a pesquisa
e tambem e aplicada nos carros que ja estao cadastrados (basta salvar o arquivo; o robo reaplica so o que mudou).

DADOS REAIS: por padrao o robo pesquisa na internet a potencia, o peso, a tracao e a velocidade maxima do carro
(pelo "name", ou por "busca": "Ford F-150 Raptor 2010" se quiser ser mais especifico) e ajusta a fisica a eles.
  "buscar_dados": false     -> desliga a pesquisa
  "real": {"hp": 411, "kg": 2650, "awd": true, "top_kmh": 170, "cyl": 8}   -> forca valores (tem prioridade)

ATUALIZAR CARROS JA CADASTRADOS (Actions > Adicionar carro a partir de GLB > Run workflow):
  atualizar = todos            -> pesquisa de novo TODOS os carros e reaplica a fisica
  atualizar = id1,id2          -> so esses ids (ex.: ford-f150-raptor)
  simular   = marcado          -> so mostra o que mudaria, sem gravar (bom para conferir antes)
  Carros com "travado": true em tools/specs_manual.json nunca sao mexidos pela pesquisa automatica.
Pesquisa gratis e melhor: cadastre o segredo GEMINI_API_KEY (chave gratuita em aistudio.google.com) - veja LEIA-ME-DADOS.md
"""
import glob, hashlib, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import specs_reais

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PASTA = os.path.join(ROOT, 'novos-carros')
FLAGS = {'brand': '--brand', 'class': '--class', 'scale': '--scale', 'length': '--length', 'preset': '--preset', 'specs': '--specs',
         'wheel_nodes': '--wheel-nodes', 'drop': '--drop', 'brake_nodes': '--brake-nodes', 'rotate_y': '--rotate-y', 'tex_size': '--tex-size', 'wheel_mode': '--wheel-mode', 'split_wheels': '--split-wheels'}


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'carro'


def preset_de(car, cfg, manual, presets):
    """Qual preset base usar: .json > specs_manual > o que ficou gravado no carro > palpite pela classe/massa."""
    for nome in (cfg.get('preset'), manual.get('preset'), car.get('preset')):
        if nome in presets:
            return nome
    classe = (car.get('class') or '').lower()
    if 'pickup' in classe or 'suv' in classe or (car.get('params') or {}).get('mass', 0) > 2000:
        return 'pickup' if 'pickup' in presets else 'esportivo'
    return 'esportivo'


def ajustar_com_dados_reais(car_id, cfg, nome, simular=False):
    reg_path = os.path.join(ROOT, 'assets', 'cars', 'cars.json')
    reg = json.load(open(reg_path, encoding='utf-8'))
    car = next(c for c in reg['cars'] if c['id'] == car_id)
    manual = specs_reais.carregar_manual(car_id)
    real = specs_reais.buscar(cfg.get('busca') or car.get('busca') or nome, cfg.get('real'), car_id)
    if not real:
        print('  nenhum dado real encontrado; mantendo o preset'); return False
    presets = json.load(open(os.path.join(ROOT, 'tools', 'presets.json'), encoding='utf-8'))
    pnome = preset_de(car, cfg, manual, presets)
    preset = presets[pnome]
    raio = None
    try:
        raio = json.load(open(os.path.join(ROOT, 'assets', 'cars', car_id, 'car.json')))['radius'] * car['scale']
    except Exception:
        pass
    P, cyl, specs = specs_reais.aplicar(preset, real, raio)
    if simular:
        print('  [simulacao] preset %s | fonte: %s | ficha nova: %s | ficha atual: %s' % (pnome, real.get('fonte', 'manual'), specs, car.get('specs', '')))
        return True
    car['params'], car['cyl'], car['preset'] = P, cyl, pnome
    car['real'] = {k: v for k, v in real.items()}  # guarda o que foi achado (e a fonte) para conferir depois
    if cfg.get('busca'):
        car['busca'] = cfg['busca']
    if manual:  # marca que a tabela manual ja foi aplicada (so reaplica se voce mudar os numeros dela)
        car['specs_hash'] = hashlib.md5(json.dumps(manual, sort_keys=True).encode()).hexdigest()[:10]
    if not cfg.get('specs') and specs:
        car['specs'] = specs
    json.dump(reg, open(reg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('  dados reais aplicados (%s): %s' % (real.get('fonte', 'manual'), specs))
    return True


def atualizar_existentes(alvo, simular=False):
    """Pesquisa de novo (e reaplica a fisica) em carros JA cadastrados. alvo = 'todos' ou 'id1,id2'."""
    reg_path = os.path.join(ROOT, 'assets', 'cars', 'cars.json')
    if not os.path.exists(reg_path):
        print('cars.json nao existe ainda.'); return
    cars = json.load(open(reg_path, encoding='utf-8'))['cars']
    ids = [c['id'] for c in cars] if alvo.strip().lower() in ('todos', 'all', '*') else [x.strip() for x in alvo.split(',') if x.strip()]
    for car_id in ids:
        car = next((c for c in cars if c['id'] == car_id), None)
        if not car:
            print('==> id desconhecido:', car_id); continue
        if specs_reais.carregar_manual(car_id).get('travado'):
            print('==> pulando (travado em specs_manual.json):', car_id); continue
        print('==> atualizando', car_id)
        try:
            ajustar_com_dados_reais(car_id, {}, car.get('name') or car_id, simular)
        except Exception as e:
            print('  [aviso] nao consegui atualizar', car_id, ':', e)


def aplicar_manuais():
    """Aplica tools/specs_manual.json aos carros JA cadastrados (nao precisa do .glb). So mexe nos que mudaram."""
    reg_path = os.path.join(ROOT, 'assets', 'cars', 'cars.json')
    if not os.path.exists(reg_path):
        return
    for car_id, m in specs_reais.carregar_manual().items():
        reg = json.load(open(reg_path, encoding='utf-8'))
        car = next((c for c in reg['cars'] if c['id'] == car_id), None)
        if not car:
            continue
        h = hashlib.md5(json.dumps(m, sort_keys=True).encode()).hexdigest()[:10]
        if car.get('specs_hash') == h:
            continue
        print('==> aplicando specs_manual.json em', car_id)
        try:
            ajustar_com_dados_reais(car_id, {}, car.get('name') or car_id)
        except Exception as e:
            print('  [aviso] nao consegui aplicar em', car_id, ':', e)


def main():
    alvo = os.environ.get('ATUALIZAR', '').strip()
    simular = os.environ.get('SIMULAR', '').strip().lower() in ('1', 'true', 'sim', 'yes')
    if alvo:
        atualizar_existentes(alvo, simular); return 0
    glbs = sorted(glob.glob(os.path.join(PASTA, '*.glb')) + glob.glob(os.path.join(PASTA, '*.GLB')))
    if not glbs:
        print('Nenhum .glb em novos-carros/.')
        aplicar_manuais(); return 0
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
                cmd += [flag] if k == 'split_wheels' else [flag, str(cfg[k])]
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
    aplicar_manuais()
    if falhas:
        print('\nFALHARAM:', ', '.join(falhas), '\nDica: envie um', '<nome>.json', 'com "wheel_nodes" ou "rotate_y" e tente de novo.'); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
