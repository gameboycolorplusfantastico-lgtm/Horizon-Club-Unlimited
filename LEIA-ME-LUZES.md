# Faróis e lanternas — automático para todo carro novo

O jogo descobre sozinho, ao carregar cada carro, quais peças são luzes (função `classifyLights` em `src/render.js`).
Não precisa de `--brake-nodes`, nem de reprocessar o carro, nem de mexer no `car.json`.

**Como decide** (pelo nome do material e pela posição na carroceria):
- **Lanterna traseira** (acende forte ao frear/dar ré, fraca com o carro ligado): nomes com `tail`, `brake light`, `red glass`, `detailglassred`, pacotes `LOD_A_BRAKES_*` na traseira, ou vidro vermelho.
- **Farol** (aceso sempre): nomes com `head light`, `headlamp`, `fog light` na frente.
- **Material de luzes com farol e lanterna juntos** (`..._mm_lights`, `Light`, `LightA_Material`, `LightBucket`...): a frente acende branca e a traseira acende vermelha.
- Ignora setas/pisca (laranja), ré, refletor, retrovisor, para-brisa e vidros comuns.

**Carro com materiais sem nome** (ex.: `Material.001`): o jogo não tem como adivinhar. Abra `assets/cars/<id>/car.json` e adicione na raiz:

    "lightsMap": { "Material.004": "brake", "Material.002": "head", "Material.007": "lamp" }

(`brake` = lanterna, `head` = farol, `lamp` = os dois). Para testar qual material é qual, troque e olhe o carro de frente e de trás.
Para desligar as luzes de um carro: `"lights": false` na raiz do `car.json`. Para um material específico: `"nolight": true` no material.
Se um material já vier com `"brake": true` / `"head": true` / `"lamp": true`, o jogo respeita.

Depois de mexer em `src/render.js`, rode `python3 tools/build.py` (ou o workflow "montar-index") para atualizar o `index.html`.
