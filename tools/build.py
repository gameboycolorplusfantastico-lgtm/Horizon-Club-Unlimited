import os, glob
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
t = open(root + '/src/template.html', encoding='utf-8').read()
for k, f in (('CORE', 'core.js'), ('RENDER', 'render.js'), ('INPUT', 'input.js'), ('AUDIO', 'audio.js'), ('MAIN', 'main.js')):
    js = open(root + '/src/' + f, encoding='utf-8').read().replace('</script>', '<\\/script>')
    t = t.replace('{{%s}}' % k, js)
# modulos opcionais em src/mods/: todo .js vira script e todo .css entra no <style> (camera_mlc, hud_blur, menu_fh2...)
mods = ''.join(open(f, encoding='utf-8').read().replace('</script>', '<\\/script>') + '\n' for f in sorted(glob.glob(root + '/src/mods/*.js')))
css = ''.join(open(f, encoding='utf-8').read() + '\n' for f in sorted(glob.glob(root + '/src/mods/*.css')))
t = t.replace('{{MODS}}', mods).replace('/*{{MODS_CSS}}*/', css)
open(root + '/index.html', 'w', encoding='utf-8').write(t)
print('index.html', len(t) // 1024, 'KB')

# lista de arquivos para a tela de carregamento baixar tudo (assets/manifest.json). As musicas do radio ficam de fora (tocam sob demanda).
import json, hashlib
fl = []
for dp, dn, fn in os.walk(root + '/assets'):
    for f in sorted(fn):
        p = os.path.join(dp, f); rel = os.path.relpath(p, root).replace(os.sep, '/')
        if rel.startswith('assets/radio/') or rel == 'assets/manifest.json' or f.endswith(('.md', '.txt')): continue
        fl.append([rel, os.path.getsize(p)])
fl.sort()
ver = hashlib.md5(json.dumps(fl).encode()).hexdigest()[:10]
open(root + '/assets/manifest.json', 'w').write(json.dumps({'v': ver, 'files': fl}, separators=(',', ':')))
print('manifest', len(fl), 'arquivos', sum(x[1] for x in fl) // 1048576, 'MB, v', ver)
