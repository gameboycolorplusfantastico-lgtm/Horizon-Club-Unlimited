# Como colocar o jogo no GitHub (e jogar pela internet)

O jogo é só arquivos estáticos, então o **GitHub Pages** hospeda de graça: seu jogo vira um link do tipo `https://SEU_USUARIO.github.io/horizon-club-unlimited/`.

## 1. Criar a conta e o repositório

1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em **New repository** (botão verde "+" > New repository).
3. Nome: `horizon-club-unlimited`. Deixe **Public** (o Pages grátis exige público) e **não** marque "Add a README".
4. Clique em **Create repository**.

## 2. Enviar os arquivos

### Opção A: pelo computador (recomendado)

**Com GitHub Desktop (mais fácil):** instale https://desktop.github.com, entre com sua conta, `File > Add local repository`, escolha a pasta do jogo (ele oferece "create a repository"), depois **Commit to main** e **Publish repository**.

**Com o terminal**, dentro da pasta do jogo:

```
git init
git add .
git commit -m "Horizon Club Unlimited - primeira versão"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/horizon-club-unlimited.git
git push -u origin main
```

Na hora de autenticar, o GitHub não aceita senha: use um **token** (Settings > Developer settings > Personal access tokens > Tokens (classic) > marque `repo`) no lugar da senha, ou rode `gh auth login` se tiver o GitHub CLI.

### Opção B: só pelo celular

- **Termux (Android)**: instale o Termux, rode `pkg install git python`, copie a pasta do jogo para o armazenamento do Termux (`termux-setup-storage`) e use os mesmos comandos do terminal acima.
- **Site do GitHub no navegador**: em *Add file > Upload files* dá para enviar arquivos, mas **não pastas inteiras no celular**, o limite é 25 MB por arquivo e 100 arquivos por envio. Como o jogo tem pastas (`assets/cars/...`), prefira o Termux ou um computador para o primeiro envio.

## 3. Ligar o site (GitHub Pages)

1. No repositório: **Settings > Pages**.
2. Em **Build and deployment > Source**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e **Save**.
3. Espere 1 a 2 minutos. O link aparece no topo da mesma página.

Pronto: abra o link no celular ou PC. Os arquivos grandes (`.wasm`, 4 a 7 MB cada) são bem abaixo do limite de 100 MB do GitHub.

## 4. Rotina para cada carro/conteúdo novo

```
python3 tools/add_car.py sources/novo.glb --id novo-carro --name "Novo Carro" ...   # empacota e registra
python3 -m http.server 8000                                                           # teste local
git add .
git commit -m "Novo carro: Novo Carro"
git push
```

Em cerca de 1 minuto o site online já mostra o carro novo. **Só rode `python3 tools/build.py` se você mexeu em `src/`** (ele regenera o `index.html`; lembre de dar commit nele também).

Quer que o `index.html` seja recompilado sozinho a cada push? Veja `tools/pages.yml.exemplo` (opcional).

## Dicas

- Os `.glb` originais ficam em `sources/`, que está no `.gitignore`: não sobem para o GitHub (são pesados). Guarde-os em outro lugar também (Drive etc.).
- Se algum arquivo passar de 50 MB (mapa gigante, por exemplo), use o **Git LFS** ou anexe em *Releases*. Repositórios com mais de 1 GB ficam lentos.
- Depois de publicar, se o navegador mostrar a versão antiga, force a atualização (Ctrl+F5 no PC; no celular, limpe o cache do site).
- Licenças: confira se você pode redistribuir os modelos 3D (muitos do Sketchfab exigem dar crédito ao autor ou proíbem uso comercial). Se o repositório for público, qualquer um pode baixar os arquivos.

---

# Automatizar tudo pelo navegador do celular (GitHub Actions)

Dois "robôs" do GitHub fazem o trabalho pesado sem precisar de terminal. Os arquivos deles estão em `tools/workflows/` (e o GitHub só os executa dentro de `.github/workflows/`).

| Robô | Você envia para a pasta... | O que acontece |
|---|---|---|
| **Descompactar ZIP** | `zips/` um arquivo `.zip` | extrai tudo na raiz do repositório, mantendo as pastas, e apaga o zip |
| **Adicionar carro** | `novos-carros/` um `.glb` (e, se quiser, um `.json`) | empacota o carro, registra em `assets/cars/cars.json`, apaga o `.glb`; o carro aparece no menu do jogo |

## Primeira vez (repositório vazio)

Use o navegador do celular (Chrome > menu > **Site para computador**); o app do GitHub não envia arquivos.

1. Crie o repositório (passo 1 acima).
2. **Add file > Create new file**. No nome digite `.github/workflows/descompactar-zip.yml` (as barras criam as pastas) e cole o conteúdo de `descompactar-zip.yml`. **Commit changes**.
   *Atalho sem colar:* envie o `.yml` pela raiz (Add file > Upload files), abra o arquivo, toque no lápis e troque o nome para `.github/workflows/descompactar-zip.yml`.
3. Repita o passo 2 com `adicionar-carro.yml`. (Esses dois precisam ser criados à mão: o GitHub não deixa um robô criar outros robôs.)
4. **Add file > Create new file**, nome `zips/LEIA-ME.txt`, qualquer texto, commit. Isso cria a pasta `zips`.
5. Abra a pasta `zips`, **Add file > Upload files**, envie `horizon-club-unlimited.zip` e dê commit.
6. Aba **Actions**: espere o "Descompactar ZIP" ficar verde (~30 s). O jogo inteiro aparece na raiz, com as pastas.
7. Ligue o Pages (passo 3 acima).

Se o robô falhar com erro de permissão: **Settings > Actions > General > Workflow permissions > Read and write permissions > Save** e rode de novo (Actions > escolha o robô > Run workflow).

## Colocar um carro novo (o dia a dia)

1. Abra a pasta `novos-carros`, **Add file > Upload files**, envie o `.glb`. Limite do site: **25 MB por arquivo**; se for maior, reduza o modelo antes.
2. (Opcional) envie junto, no mesmo commit, um `.json` com o mesmo nome do `.glb`, por exemplo `meu-carro.json`:

```json
{
  "name": "Ford F-150 Raptor",
  "brand": "Ford",
  "class": "Pickup",
  "scale": 1.225,
  "preset": "pickup",
  "specs": "V8 6.2 · 411 cv · 4x4"
}
```

   Campos aceitos (todos opcionais): `name`, `id`, `brand`, `class`, `scale`, `length`, `preset` (`esportivo` ou `pickup`), `specs`, `wheel_nodes`, `drop`, `brake_nodes`, `rotate_y` (180 se o carro estiver virado para trás), `tex_size`. Sem o `.json`, o nome vem do nome do arquivo, a escala é 1.2 e o preset é `esportivo`.
3. Espere o robô (Actions, ~1 min). Em seguida o Pages republica o site sozinho.
4. Se o robô falhar (por exemplo "não achei as 4 rodas"), abra a execução em Actions para ler o motivo, envie um `.json` com `wheel_nodes` ou `rotate_y` e ele tenta de novo.

Para ajustar a física depois, edite `assets/cars/cars.json` direto no site do GitHub (lápis) e dê commit.

Pelo terminal (git) o `.glb` também funciona: `git add -f novos-carros/seu.glb`.
