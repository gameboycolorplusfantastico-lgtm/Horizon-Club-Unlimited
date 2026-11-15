# Áudio do jogo

## Instalar
1. No GitHub, envie este zip para a pasta `zips/` (o Action "Descompactar ZIP" espalha `src/` e `assets/` no lugar certo).
2. Crie `.github/workflows/montar-index.yml` com o arquivo `montar-index.yml` que veio junto (o Action de zip não mexe em `.github`).
3. Aba Actions -> "Montar index.html" -> Run workflow. Ele roda `tools/build.py` e salva o `index.html`. A Vercel publica sozinha.
Não precisa mais do Action que baixava o Engine_Sim: os arquivos já vêm em `assets/engine-sim/` (Engine_Sim, MIT).
Pode apagar `.github/workflows/engine-sim.yml`, se tiver enviado.

## Como o motor funciona
Prioridade: 1) gravações reais (`assets/audio/engine/*.json`, se existirem) 2) Engine_Sim 3) motor simples.
No Engine_Sim o giro, o acelerador, a velocidade e as trocas de marcha vêm do próprio jogo (o conta-giros e o som batem).
O motor de cada carro vem do `assets/cars/cars.json`: campo "engine" > texto de "specs" > "cyl". Ids: vtwin i3 rotary2 i4 boxer4 i5 i6 i6diesel v6 v6tt flat6 v8cross v8tt v8flat v10 v12.
Ao iniciar o jogo aparece um aviso no canto: verde = Engine_Sim ativo; vermelho = motor simples (com o motivo do erro).

## Efeitos reais (assets/audio/*.wav)
collision-heavy (batida), handbrake (freio de mão), gravel-loop (grama/terra), engine-stall (água).
Licença do pacote free-racing-sounds: livre para jogos, pode ficar em repositório público, não pode redistribuir os áudios sozinhos.
