# Rádio do jogo

4 estações (lista em `assets/radio/radio.json`, tirada do guia de programação):
104.9 APEX FM · 96.3 REDLINE RADIO · 94.7 SOLSTICE FM · 93.7 BLACKTOP RADIO — 20 faixas cada.

## Controles
- **N** — próxima estação (APEX → REDLINE → SOLSTICE → BLACKTOP → desligado). **B** — pular faixa.
- Gamepad: direcional ← → troca de estação, ↑ pula faixa. Celular: botão **RÁDIO**.
- Na pausa/menu a música fica abafada (filtro passa-baixa), como em Forza Horizon.

## Colocar as músicas
Em `assets/radio/<estação>/` coloque os arquivos com o NÚMERO da faixa: `01.mp3`, `02.mp3` … `20.mp3`
(também aceita ogg, m4a e wav). Cada pasta tem um `LEIA-ME.txt` dizendo qual número é qual música.
Estações: `apex`, `redline`, `solstice`, `blacktop`. Faixa sem arquivo é pulada sozinha; a ordem é aleatória.

## Vinhetas
A cada 3 músicas toca uma vinheta: `vinheta-1.mp3`, `vinheta-2.mp3`, `vinheta-3.mp3` na pasta da estação (4 a 8 s).
Sem o arquivo, o jogo faz um chiado de sintonia e o locutor do navegador diz o nome da estação.

## Mudar a lista
Edite `assets/radio/radio.json` (nome, frequência, slogan, cor, faixas). Pode ter mais ou menos de 20 faixas.
