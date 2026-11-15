import os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
t = open(root + '/src/template.html', encoding='utf-8').read()
for k, f in (('CORE', 'core.js'), ('RENDER', 'render.js'), ('INPUT', 'input.js'), ('AUDIO', 'audio.js'), ('MAIN', 'main.js')):
    js = open(root + '/src/' + f, encoding='utf-8').read().replace('</script>', '<\\/script>')
    t = t.replace('{{%s}}' % k, js)
open(root + '/index.html', 'w', encoding='utf-8').write(t)
print('index.html', len(t) // 1024, 'KB')
