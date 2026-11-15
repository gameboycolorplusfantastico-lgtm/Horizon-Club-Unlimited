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
