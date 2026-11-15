# Horizon Club Unlimited

Jogo de direção em mundo aberto (WebGL2 puro, sem bibliotecas). Cidade inteira para dirigir sem rota, com colisão que segue o relevo, vários carros e física própria para cada um.

## Rodar no computador

Abra um terminal **dentro desta pasta** e rode:

```
python3 -m http.server 8000
```

Depois acesse http://localhost:8000. (Abrir o `index.html` com duplo clique não funciona: o navegador bloqueia o carregamento dos arquivos em `assets/`.)

**Controles:** teclado WASD/setas, Espaço freio de mão, C câmera, R desvira, T volta à rua, Esc pausa. Controle: RT acelera, LT freia/ré, X ou A freio de mão, Y câmera, B desvira, Start pausa. Celular: faixa da esquerda esterça, pedais à direita.

## Estrutura

```
index.html              jogo completo, GERADO a partir de src/ (não edite à mão)
src/                    código-fonte: core.js (física), render.js, input.js, audio.js, main.js, template.html
assets/
  city.json / city.wasm mapa (+ tex/ e minimap.png)
  cars/
    cars.json           LISTA DE CARROS do jogo (cada carro registrado aqui aparece no menu)
    bmw-m3-gtr/         car.json, car.wasm, tex/   (um carro = uma pasta)
    ford-f150-raptor/
tools/
  add_car.py            adiciona um carro novo a partir de um .glb  (principal ferramenta do dia a dia)
  build.py              junta src/ em index.html (só precisa rodar se você mexer em src/)
  pack.py, glbpy.py     empacotador do mapa e leitor de GLB
  presets.json          físicas prontas (esportivo, pickup) usadas pelo add_car.py
sources/                (não vai pro GitHub) coloque aqui os .glb originais
```

## Adicionar um carro novo (não precisa mexer no index.html)

1. Coloque o `.glb` em `sources/`.
2. Rode, por exemplo:

```
python3 tools/add_car.py sources/meu_carro.glb --id meu-carro --name "Nome do Carro" --brand Marca --class Esportivo --scale 1.2 --preset esportivo --specs "V6 · 300 cv · tração traseira"
```

3. Pronto: ele já aparece no menu. Teste com `python3 -m http.server 8000`.

Opções úteis do `add_car.py`:

| Opção | Para que serve |
|---|---|
| `--scale 1.225` | tamanho no jogo; comprimento = 4,49 m × scale (1.2 ≈ 5,4 m; 1.225 ≈ 5,5 m; 1.0 ≈ 4,5 m) |
| `--preset pickup` | física base: `esportivo` (padrão) ou `pickup`. Novos presets: edite `tools/presets.json` |
| `--report` | só lista as peças e quais viraram roda, sem gravar (use quando as rodas não forem achadas) |
| `--wheel-nodes REGEX` | regex dos nomes dos objetos de roda, se o padrão não funcionar |
| `--rotate-y 180` | o carro está virado para trás |
| `--drop REGEX` | descarta peças pesadas/invisíveis (interior, chassi por baixo...) para aliviar no celular |
| `--brake-nodes REGEX` | peças que acendem ao frear (lanternas vermelhas) |
| `--tex-size 1024` | tamanho máximo das texturas |

O modelo precisa ter as 4 rodas como objetos separados (ou ao menos peças com "wheel", "tire", "rim" etc. no nome). O jogo assume +Z para a frente e +X para a esquerda; a origem é ajustada sozinha para o chão, entre os eixos.

### Ajustar a física de um carro

Tudo fica em `assets/cars/cars.json`, no campo `params` de cada carro (valores que faltam usam o padrão do BMW):

`mass` (kg), `awd` (true = 4x4), `gears` (relações, o primeiro 0 é neutro), `rev` (ré), `final` (diferencial), `torque` (tabela `[rpm, N·m]`), `idle`, `rpmMax`, `rpmCut`, `shiftUp`/`shiftDn` (rotações de troca), `vMax` (limite de velocidade em m/s), `mu` (aderência no asfalto), `offroad` (aderência extra em terra/grama), `k`/`cBump`/`cReb`/`kArb` (molas e amortecedores), `L0` (curso da suspensão), `cdA`/`clA` (arrasto e downforce), `steerMax`. O campo `cyl` (cilindros) muda o som do motor.

## Automação pelo GitHub (sem terminal)

Envie um `.glb` para `novos-carros/` e o robô empacota e registra o carro; envie um `.zip` para `zips/` e o robô extrai tudo com as pastas. Veja o fim do **COMO-PUBLICAR-NO-GITHUB.md**.

## Publicar no GitHub

Veja **COMO-PUBLICAR-NO-GITHUB.md**.
