# Postes de luz e sinaleiras
- `assets/props.json` + `props.wasm` + `tex/props_*.jpg`: modelos (do GLB) e posições (685 postes: 470 originais + 215 intercalados a ~16 m nos trechos retos, validados no chao do jogo; antes, 66 sinaleiras em 21 cruzamentos).
- Postes: na calçada, ~1,5 m do meio-fio, braço virado para a rua, fora de curva fechada, cruzamento, prédio, árvore e debaixo da via elevada.
- Sinaleiras: canto direito de cada aproximação, braço sobre a pista, ciclo vermelho/amarelo/verde (eixos opostos defasados). Postes têm colisão.
- Regerar: `python3 tools/make_props.py SINALEIRAS.glb placements.json assets`; depois `python3 tools/build.py`. Scripts da análise do mapa em `tools/props_analise/`.
- Depuração: `?auto=1&at=x,y,z,yaw` teleporta o carro.
