#!/usr/bin/env python3
"""Busca dados REAIS de um carro na internet e converte em fisica para o jogo.

Ordem (a primeira que achar vale; o que voce escreveu na mao SEMPRE vence):
  0. "real" no .json do carro  >  tools/specs_manual.json            (gratis, 100% preciso - recomendado)
  1. API da Anthropic com pesquisa na web   (se existir o segredo ANTHROPIC_API_KEY; PAGO)
  2. Wikipedia lida por IA gratuita do Google (se existir o segredo GEMINI_API_KEY; GRATIS, chave em aistudio.google.com)
  3. Wikipedia lida por regras (sem chave nenhuma; melhorada: varias paginas candidatas, {{convert}}, pt+en)
  4. Nada achado -> o carro usa o preset normal (esportivo/pickup)

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
            out[k] = v.strip()[:140]
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


# ---------------- Wikipedia (compartilhado) ----------------
def _wiki_api(lang, **params):
    params['format'] = 'json'
    return json.loads(_get('https://%s.wikipedia.org/w/api.php?' % lang + urllib.parse.urlencode(params)))


def _tokens(s):
    return [w for w in re.findall(r'[a-z0-9]+', s.lower()) if w not in ('automobile', 'automovel', 'car', 'the', 'de', 'da', 'do')]


def wiki_candidatas(nome, lang='en', n=5):
    """Titulos candidatos, o mais parecido com o nome primeiro (a busca crua da Wikipedia erra muito em carros)."""
    termo = nome + (' automobile' if lang == 'en' else ' automóvel')
    hits = _wiki_api(lang, action='query', list='search', srsearch=termo, srlimit=n)['query']['search']
    q = set(_tokens(nome))

    def score(h):
        tt = set(_tokens(h['title']))
        return (len(q & tt) / (len(q) or 1)) - 0.05 * len(tt - q)  # cobre o nome e nao tem palavras a mais
    return [h['title'] for h in sorted(hits, key=score, reverse=True)]


def wiki_texto(title, lang='en'):
    j = _wiki_api(lang, action='parse', page=title, prop='wikitext', redirects=1)
    wt = j['parse']['wikitext']['*']
    wt = re.sub(r'<!--.*?-->', '', wt, flags=re.S)
    wt = re.sub(r'<ref[^>]*?/>|<ref[^>]*?>.*?</ref>', '', wt, flags=re.S)
    return wt


def _n(s):
    return float(s.replace(',', '').replace(' ', ''))


def _conv(txt):
    """Acha medidas em {{convert|411|hp|kW}} / {{cvt|...}} e em texto solto. Devolve lista de (valor, unidade em minusculo)."""
    out = []
    for m in re.finditer(r'\{\{\s*(?:convert|cvt)\s*\|\s*([\d,\.]+)(?:\s*\|\s*(?:to|-|–|and|&)\s*\|\s*[\d,\.]+)?\s*\|\s*([a-zA-Z/]+)', txt, re.I):
        try:
            out.append((_n(m.group(1)), m.group(2).lower()))
        except ValueError:
            pass
    for m in re.finditer(r'(\d[\d,\.]*)\s*(hp|bhp|ps|cv|kw|kg|lb|lbs|km/h|kph)\b', txt, re.I):
        try:
            out.append((_n(m.group(1)), m.group(2).lower()))
        except ValueError:
            pass
    return out


def wiki_regras(wt, title):
    """Extrai os numeros do texto da Wikipedia por regras (sem IA)."""
    fim = wt.find('\n}}\n') if '\n}}\n' in wt else 9000
    ib = wt[:max(3000, min(fim, 12000))]
    d = {}
    hps = []
    for v, u in _conv(ib):
        if u in ('hp', 'bhp'):
            hps.append(v)
        elif u in ('ps', 'cv'):
            hps.append(v * 0.9863)
        elif u == 'kw':
            hps.append(v * 1.341)
    hps = [h for h in hps if 40 <= h <= 2000]
    if hps:
        d['hp'] = int(round(max(hps)))
    kgs = []
    for m in re.finditer(r'(?:curb ?weight|kerb ?weight|weight)\s*=\s*([^\n]*)', ib, re.I):
        for v, u in _conv(m.group(1)):
            if u == 'kg':
                kgs.append(v)
            elif u in ('lb', 'lbs'):
                kgs.append(v * 0.4536)
    kgs = [k for k in kgs if 600 <= k <= 6000]
    if kgs:
        d['kg'] = int(round(sum(kgs[:2]) / len(kgs[:2])))
    tops = [v if u in ('km/h', 'kph') else v * 1.609 for v, u in _conv(ib) if u in ('km/h', 'kph', 'mph')]
    tops = [x for x in tops if 100 <= x <= 450]
    if tops:
        d['top_kmh'] = int(round(max(tops)))
    if re.search(r'all-wheel|four-wheel|4wd|awd|4x4|quattro|xdrive|4matic', ib.lower()):
        d['awd'] = True  # so afirma 4x4 quando achou; nunca assume "tracao simples" por falta de dado
    m = re.search(r'\bV\s?(\d{1,2})\b', ib)
    if m:
        d['cyl'] = int(m.group(1))
    else:
        m = re.search(r'(?:inline|straight|flat|boxer)[- ](\d)|\bI(\d)\b|\bH(\d)\b|(\d)[- ]cylinder', ib, re.I)
        if m:
            d['cyl'] = int([g for g in m.groups() if g][0])
    d = limpar(d)
    if d:
        d['fonte'] = 'Wikipedia: ' + title
    return d


# ---------------- 2) Wikipedia + IA gratuita do Google (Gemini) ----------------
GEMINI_MODELOS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']


def _gemini(prompt):
    key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not key:
        return None
    modelos = [os.environ['GEMINI_MODEL']] if os.environ.get('GEMINI_MODEL') else GEMINI_MODELOS
    body = json.dumps({'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'temperature': 0, 'responseMimeType': 'application/json'}}).encode()
    for mod in modelos:
        try:
            r = json.loads(_get('https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent' % mod, body,
                                {'content-type': 'application/json', 'x-goog-api-key': key}, 90))
            return ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts'])
        except Exception as e:  # modelo aposentado / limite do plano gratis: tenta o proximo
            print('  [aviso] Gemini %s falhou: %s' % (mod, e))
    return None


def via_gemini(nome):
    if not os.environ.get('GEMINI_API_KEY', '').strip():
        return {}
    for lang in ('en', 'pt'):
        try:
            tit = wiki_candidatas(nome, lang, 3)
        except Exception as e:
            print('  [aviso] Wikipedia (%s) falhou: %s' % (lang, e))
            continue
        for title in tit[:2]:
            try:
                wt = wiki_texto(title, lang)[:16000]
            except Exception as e:
                print('  [aviso] nao li a pagina', title, ':', e)
                continue
            prompt = ('Abaixo esta o texto-fonte (wikitexto da Wikipedia, pagina "%s") sobre um carro. Extraia as especificacoes do carro "%s" '
                      'USANDO SOMENTE o texto abaixo. Se a pagina descrever varias versoes, use a versao pedida no nome; se o nome nao diz, use a versao mais conhecida/mais potente. '
                      'Se a pagina NAO for sobre esse carro, responda {}. Responda SOMENTE um JSON com as chaves: hp (potencia maxima em cv/hp, numero), torque_nm, '
                      'kg (peso em ordem de marcha), awd (true se tracao integral/4x4, false se tracao simples e o texto diz isso, senao null), top_kmh (velocidade maxima), '
                      'cyl (numero de cilindros), redline (rpm maximo), motor (texto curto ex "V8 6.2"), versao (texto curto: a qual versao/ano os numeros se referem). '
                      'Use null no que nao estiver no texto. Converta lb->kg, kW->cv, mph->km/h. NAO invente.\n\n---\n%s') % (title, nome, wt)
            txt = _gemini(prompt)
            if not txt:
                return {}
            try:
                m = re.search(r'\{.*\}', txt, re.S)
                j = json.loads(m.group(0)) if m else {}
            except Exception:
                j = {}
            ver = j.pop('versao', None) if isinstance(j, dict) else None
            d = limpar(j)
            if d.get('hp') or d.get('kg'):
                d['fonte'] = ('Wikipedia(%s): %s + IA Gemini' % (lang, title)) + ((' - ' + str(ver)) if ver else '')
                return d
    return {}


# ---------------- 3) Wikipedia por regras (sem chave) ----------------
def via_wikipedia(nome):
    melhor = {}
    for lang in ('en', 'pt'):
        try:
            tit = wiki_candidatas(nome, lang, 4)
        except Exception as e:
            print('  [aviso] Wikipedia (%s) falhou: %s' % (lang, e))
            continue
        for title in tit[:3]:
            try:
                d = wiki_regras(wiki_texto(title, lang), title)
            except Exception as e:
                print('  [aviso] nao li a pagina', title, ':', e)
                continue
            if len(d) > len(melhor) and ('hp' in d or 'kg' in d):
                melhor = d
            if 'hp' in melhor and 'kg' in melhor:
                return melhor
    return melhor


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
        achado = via_api(nome) or via_gemini(nome) or via_wikipedia(nome)
        if achado and achado.get('fonte', '').startswith('Wikipedia') and 'Gemini' not in achado.get('fonte', ''):
            print('  [aviso] Wikipedia por regras e pouco confiavel (pode pegar a pagina/versao errada). Melhor preencher tools/specs_manual.json ou usar GEMINI_API_KEY')
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
