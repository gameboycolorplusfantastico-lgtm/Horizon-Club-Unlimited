#!/usr/bin/env python3
"""Busca dados REAIS de um carro na internet e converte em fisica para o jogo.

Ordem de busca:
  1. API da Anthropic com pesquisa na web (se existir o segredo ANTHROPIC_API_KEY no GitHub)
  2. Wikipedia (sem chave nenhuma; menos preciso)
  3. Nada achado -> o carro usa o preset normal (esportivo/pickup)

Dados que o .json do carro pode trazer para FORCAR um valor (tem prioridade sobre a busca):
  "real": {"hp": 411, "kg": 2650, "awd": true, "top_kmh": 170, "cyl": 8, "torque_nm": 590, "redline": 6300, "motor": "V8 6.2"}
"""
import json, math, os, re, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
LIMITES = {'hp': (40, 2000), 'kg': (600, 6000), 'top_kmh': (100, 450), 'cyl': (3, 16), 'torque_nm': (60, 2500), 'redline': (4000, 11000)}


def _get(url, data=None, headers=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers=headers or {'User-Agent': 'horizon-club-bot/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'replace')


def limpar(d):
    out = {}
    for k, v in (d or {}).items():
        if k in LIMITES:
            try:
                v = float(v)
            except (TypeError, ValueError):
                continue
            lo, hi = LIMITES[k]
            if lo <= v <= hi:
                out[k] = int(round(v))
        elif k == 'awd' and isinstance(v, bool):
            out[k] = v
        elif k in ('motor', 'fonte') and isinstance(v, str) and v.strip():
            out[k] = v.strip()[:60]
    return out


# ---------------- 1) API Anthropic + web ----------------
def via_api(nome):
    key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not key:
        return {}
    prompt = ('Pesquise na web as especificacoes REAIS do carro: "%s". Responda SOMENTE com um JSON (sem texto, sem crases) com as chaves: '
              'hp (potencia maxima em cv/hp), torque_nm, kg (peso em ordem de marcha), awd (true se tracao integral/4x4), '
              'top_kmh (velocidade maxima real), cyl (numero de cilindros), redline (rpm maximo), motor (texto curto, ex "V8 6.2"). '
              'Use null no que nao encontrar. Nao invente.') % nome
    body = json.dumps({'model': os.environ.get('CLAUDE_MODEL', 'claude-sonnet-5-5'), 'max_tokens': 1500,
                       'tools': [{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': 4}],
                       'messages': [{'role': 'user', 'content': prompt}]}).encode()
    try:
        r = json.loads(_get('https://api.anthropic.com/v1/messages', body,
                            {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'}, 120))
        txt = ''.join(b.get('text', '') for b in r.get('content', []) if b.get('type') == 'text')
        m = re.search(r'\{.*\}', txt, re.S)
        d = limpar(json.loads(m.group(0))) if m else {}
        if d:
            d['fonte'] = 'web (API Anthropic)'
        return d
    except Exception as e:
        print('  [aviso] busca via API falhou:', e)
        return {}


# ---------------- 2) Wikipedia ----------------
def via_wikipedia(nome):
    try:
        q = urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': nome + ' automobile', 'srlimit': 1, 'format': 'json'})
        hits = json.loads(_get('https://en.wikipedia.org/w/api.php?' + q))['query']['search']
        if not hits:
            return {}
        title = hits[0]['title']
        q = urllib.parse.urlencode({'action': 'parse', 'page': title, 'prop': 'wikitext', 'format': 'json', 'redirects': 1})
        wt = json.loads(_get('https://en.wikipedia.org/w/api.php?' + q))['parse']['wikitext']['*']
    except Exception as e:
        print('  [aviso] Wikipedia falhou:', e)
        return {}
    ib = wt[:wt.lower().find('}}\n\n') if '}}\n\n' in wt else 6000]
    d = {}
    m = re.search(r'(\d{2,4})\s*(?:hp|bhp|PS)\b', ib, re.I)
    if m:
        d['hp'] = int(m.group(1))
    else:
        m = re.search(r'(\d{2,4})\s*kW', ib, re.I)
        if m:
            d['hp'] = int(int(m.group(1)) * 1.341)
    m = re.search(r'(?:curb ?weight|weight)\s*=\s*[^\n]*?(\d[\d,]{2,5})\s*(?:kg|\|kg)', ib, re.I)
    if m:
        d['kg'] = int(m.group(1).replace(',', ''))
    else:
        m = re.search(r'(?:curb ?weight|weight)\s*=\s*[^\n]*?(\d[\d,]{3,6})\s*(?:lb|\|lb)', ib, re.I)
        if m:
            d['kg'] = int(int(m.group(1).replace(',', '')) * 0.4536)
    m = re.search(r'(\d{3})\s*(?:km/h|\|km/h)', ib, re.I)
    if m:
        d['top_kmh'] = int(m.group(1))
    low = ib.lower()
    if re.search(r'all-wheel|four-wheel|4wd|awd|4x4', low):
        d['awd'] = True  # so afirma 4x4 quando achou; nunca assume "tracao simples" por falta de dado
    m = re.search(r'\bV(\d{1,2})\b', ib)
    if m:
        d['cyl'] = int(m.group(1))
    else:
        m = re.search(r'(?:inline|straight|flat)[- ](\d)|\bI(\d)\b|\bH(\d)\b', ib)
        if m:
            d['cyl'] = int([g for g in m.groups() if g][0])
    d = limpar(d)
    if d:
        d['fonte'] = 'Wikipedia: ' + title
    return d


MANUAL = os.path.join(HERE, 'specs_manual.json')


def carregar_manual(car_id=None):
    """Le tools/specs_manual.json ({id_do_carro: {hp, kg, awd, cyl, top_kmh, motor, fonte, preset}}). Sem car_id devolve tudo."""
    try:
        tudo = json.load(open(MANUAL, encoding='utf-8'))
    except Exception:
        return {}
    tudo = {k: v for k, v in tudo.items() if not k.startswith('_') and isinstance(v, dict)}
    return tudo if car_id is None else tudo.get(car_id, {})


def buscar(nome, manual=None, car_id=None):
    # prioridade: "real" do .json do carro > tools/specs_manual.json > pesquisa na internet
    manual = limpar({**carregar_manual(car_id), **(manual or {})})
    achado = {}
    if not ('hp' in manual and 'kg' in manual):  # so pesquisa se o usuario nao deu potencia e peso
        print('  buscando dados reais de', nome, '...')
        achado = via_api(nome) or via_wikipedia(nome)
        if achado and achado.get('fonte', '').startswith('Wikipedia'):
            print('  [aviso] Wikipedia e pouco confiavel (pega a pagina errada). Melhor preencher tools/specs_manual.json')
    achado.update(manual)
    return achado


# ---------------- fisica ----------------
def curva_bmw():
    pts = []
    for rpm in range(0, 8201, 400):
        x = rpm / 1000
        t = 150 * x if x < 1 else (250 + 120 * math.sin((x - 1) / 3.8 * math.pi / 2) if x < 4.8 else 370 - max(0, x - 6.2) * 90)
        pts.append([rpm, round(max(60, 0 if x > 8 else t), 1) if x >= 1 else round(t, 1)])
    return pts


def pico_kw(curva):
    return max(t * r * 2 * math.pi / 60 / 1000 for r, t in curva)


def aplicar(preset, real, raio_roda=None):
    """Retorna (params, cyl, specs_texto) ajustando o preset aos dados reais."""
    P = json.loads(json.dumps(preset.get('params', {})))
    base_mass = P.get('mass', 1500)
    curva = P.get('torque') or curva_bmw()
    rpm_max = P.get('rpmMax', 8200)
    if 'hp' in real:
        k = (real['hp'] * 0.7457) / pico_kw(curva)
        curva = [[r, round(t * k, 1)] for r, t in curva]
        P['torque'] = curva
    if 'redline' in real:  # estica/encolhe a curva no eixo de rotacao
        f = real['redline'] / (P.get('rpmMax', 8200) or 8200)
        P['torque'] = [[int(r * f), t] for r, t in curva]
        P.update(rpmMax=real['redline'] + 200, rpmCut=real['redline'], idle=P.get('idle', 900))
        P['shiftUp'] = [int(x * f) for x in P.get('shiftUp', [4600, 2300])]; P['shiftDn'] = [int(x * f) for x in P.get('shiftDn', [2300, 1900])]
        rpm_max = P['rpmMax']
    if 'kg' in real:
        mk = real['kg'] / base_mass
        P['mass'] = real['kg']
        for key in ('k', 'cBump', 'cReb', 'kArb', 'bumpK'):  # molas/amortecedores explicitos do preset acompanham a massa
            if key in P:
                P[key] = round(P[key] * mk)
    if 'awd' in real:
        P['awd'] = bool(real['awd'])
    if 'top_kmh' in real:
        P['vMax'] = round(real['top_kmh'] / 3.6, 1)
        # garante que a marcha mais longa alcança a velocidade real na rotação máxima
        g = P.get('gears') or [0, 3.55, 2.30, 1.66, 1.28, 1.00, 0.80]
        fin = P.get('final', 3.46 * 1.2); wr = raio_roda or 0.385
        v_red = (P.get('rpmCut', 7900) * 2 * math.pi / 60) / (g[-1] * fin) * wr
        if v_red < P['vMax'] * 1.02:
            P['final'] = round(fin * v_red / (P['vMax'] * 1.02), 3)
    cyl = real.get('cyl') or preset.get('cyl', 6)
    partes = []
    if real.get('motor'):
        partes.append(real['motor'])
    elif real.get('cyl'):
        partes.append('%d cil.' % real['cyl'])
    if 'hp' in real:
        partes.append('%d cv' % real['hp'])
    if 'awd' in real:
        partes.append('4x4' if real['awd'] else 'tração simples')
    if 'kg' in real:
        partes.append('{:,}'.format(real['kg']).replace(',', '.') + ' kg')
    if 'top_kmh' in real:
        partes.append('%d km/h' % real['top_kmh'])
    return P, cyl, ' · '.join(partes)


if __name__ == '__main__':  # teste manual: python3 tools/specs_reais.py "Ford F-150 Raptor 2010"
    nome = ' '.join(sys.argv[1:]) or 'Ford F-150 SVT Raptor'
    r = buscar(nome); print(json.dumps(r, ensure_ascii=False, indent=1))
    pres = json.load(open(os.path.join(HERE, 'presets.json'), encoding='utf-8'))
    p, c, s = aplicar(pres['esportivo'], r); print(s); print(json.dumps(p)[:400])
