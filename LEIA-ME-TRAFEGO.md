# Tráfego de NPCs (mão americana)
- Modelos: `assets/npc/` (19 veículos dos 2 packs + carro de polícia; `tools/make_npc.py` / `tools/add_npc.py`). Civis, táxi, caminhões, ônibus, limusine e viaturas.
- Código: `src/mods/traffic.js`. Grafo de ruas: `assets/traffic.json` (203 nós, 282 trechos, 564 faixas — uma por sentido, sempre na DIREITA de quem anda; scripts em `tools/trafego/`).
- Regras: respeitam os semáforos do jogo (mesmo ciclo, amarelo = só passa se não der para frear), cruzamentos sem semáforo (um de cada vez), distância do carro da frente (modelo IDM), curvas em cruzamento, e dão preferência ao jogador. Batida: o NPC é empurrado, fica parado e some depois. Travamentos longos são desfeitos automaticamente.
- Opção no menu: Opções > **Tráfego** (Ligado/Desligado). Quantidade: `Traffic.cfg.count` (padrão 26).
- Teste sem navegador: `node tools/trafego/sim.js X Z SEGUNDOS CARROS`.

# Postes (limpeza)
- Removidos os postes comuns a menos de 11 m de uma sinaleira (ela já tem poste).
- Ruas com postes nos dois lados na mesma altura: agora **intercalados** (um lado, depois o outro).
- Postes de viaduto: agora em cima da **mureta** (129 reposicionados). Onde só há guard-rail fino, ficaram como estavam.
- props.json: 830 → 635 postes.
