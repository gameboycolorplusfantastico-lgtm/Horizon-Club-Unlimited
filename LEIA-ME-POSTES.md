# Postes de luz e sinaleiras
- `assets/props.json` + `props.wasm` + `tex/props_*.jpg`: modelos e posicoes. **830 postes** = 470 originais (calcadas do centro, nao foram adensados) + 156 em ruas que estavam sem iluminacao + 204 nos viadutos/via expressa elevada (borda externa, ~34 m). **78 sinaleiras em 25 cruzamentos** (as 66 originais + 12 em 4 cruzamentos novos).
- Postes: na calçada, ~1,5 m do meio-fio, braço virado para a rua, fora de curva fechada, cruzamento, prédio, árvore e debaixo da via elevada.
- Sinaleiras: canto direito de cada aproximação, braço sobre a pista, ciclo vermelho/amarelo/verde (eixos opostos defasados). Postes têm colisão.
- Regerar: `python3 tools/make_props.py SINALEIRAS.glb placements.json assets`; depois `python3 tools/build.py`. Scripts da análise do mapa em `tools/props_analise/`.
- Depuração: `?auto=1&at=x,y,z,yaw` teleporta o carro.

- Mao de direcao: as sinaleiras ficam no canto DIREITO de quem chega (a camera do jogo e espelhada: a 'direita' de uma direcao (dx,dz) e (dz,-dx)). O modelo e desenhado espelhado em X (render.js, drawProps) para o braco ficar sobre a pista.
