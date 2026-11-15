# Dados reais dos carros — como melhorar de graça

O robô procura os dados nesta ordem (o primeiro que achar vale; o que você escrever na mão sempre ganha):

1. **`"real"` no .json do carro** e **`tools/specs_manual.json`** — grátis e 100% preciso. É o melhor caminho.
2. `ANTHROPIC_API_KEY` — pago, só se você tiver.
3. **`GEMINI_API_KEY`** — GRÁTIS. O robô baixa a página da Wikipedia do carro (en e pt) e uma IA do Google lê o texto e extrai potência, peso, tração etc. Só usa o que está escrito na página (não inventa).
4. Sem chave nenhuma — leitura da Wikipedia por regras (melhorada, mas ainda pode errar a versão do carro).

## Ativar a pesquisa grátis (Gemini) — 3 minutos
1. Entre em https://aistudio.google.com com sua conta Google → **Get API key** → **Create API key** (não pede cartão).
2. No GitHub do jogo: **Settings → Secrets and variables → Actions → New repository secret**.
   Nome: `GEMINI_API_KEY` — Valor: a chave que você copiou.
3. Pronto: todo carro novo passa a ser pesquisado com a IA.

> O plano grátis do Gemini tem limite de uso por dia e pode mudar; para alguns carros por semana sobra. Se um modelo for aposentado o robô tenta o próximo sozinho (ou defina `GEMINI_MODEL` no workflow).

## Atualizar os carros que já estão no jogo
GitHub → **Actions → Adicionar carro a partir de GLB → Run workflow**:
- **atualizar**: `todos` ou os ids separados por vírgula (ex.: `ford-f150-raptor,bmw-m3-gtr`)
- **simular** marcado: só mostra no log o que mudaria (ficha nova × ficha atual), sem gravar. Confira primeiro, depois rode sem marcar.
- Cada carro guarda em `cars.json` o campo `real` (números achados + fonte) e `preset`.
- Para o robô NUNCA mexer num carro, ponha `"travado": true` na entrada dele em `specs_manual.json`.

## Para ficar bem detalhado (e sem depender de IA)
Copie `tools/specs_manual.exemplo.json` para `tools/specs_manual.json` e preencha os carros. Campos: `hp`, `kg`, `awd`, `top_kmh`, `cyl`, `torque_nm`, `redline`, `motor`, `preset` (`esportivo` ou `pickup`). Ao salvar, o robô reaplica sozinho.
Boas fontes grátis para conferir os números: ficha técnica da Wikipedia, ultimatecarpage.com, automobile-catalog.com, carfolio.com e o site da própria montadora (peso em ordem de marcha, potência máxima, tração).
