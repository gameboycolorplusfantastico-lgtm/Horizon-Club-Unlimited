# Mapa, minimapa e água
- **Mapa grande**: tecla **M**, toque no minimapa, botão **Mapa** na pausa, ou **Back/View** do controle (toque rápido; segurar ~0,7 s = voltar à última rua segura). Arrastar/roda/pinça = mover e zoom; clique/toque (ou Enter / botão A na mira central) marca um **destino**, que aparece no minimapa (pino, ou seta na borda se estiver longe). C / Y = centralizar no carro. Fecha com M, Esc, B ou ✕.
- O som liga/desliga agora é a tecla **U** (o M virou mapa).
- **Minimapa**: mesmo desenho do mapa grande, afasta com a velocidade, seta do carro com brilho.
- **Imagens**: `assets/map_full.webp` (1 m/pixel) e `assets/map_mini.webp` (2 m/pixel); metadados em `assets/city.json` → `minimap`. Para regerar: `node tools/mapa/grid.js 8 2510 -3040 20 1 grid.bin` (com o jogo servido em localhost:8766) e `python3 tools/mapa/mapgen.py`.
- **Água**: o mar (`src/render.js`, `drawSea`) agora é um plano infinito que acompanha a câmera até sumir na névoa.
- **Flutuação** (`src/core.js`): 8 pontos de empuxo no casco; o carro boia, balança e perde aderência; as rodas/jato dão um impulso fraco. Se ficar flutuando ~3,4 s, volta para a última rua segura. A câmera nunca desce abaixo de 1,1 m sobre o mar.
