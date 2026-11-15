# Áudio de motor (Engine_Sim)

## Instalar (3 passos, tudo pelo site do GitHub)
1. Envie `src/audio.js` (substitui o atual) e `.github/workflows/engine-sim.yml` para o repositório.
2. Aba **Actions → Atualizar audio de motor → Run workflow**. Ele baixa o Engine_Sim para `assets/engine-sim/`, roda o `tools/build.py` e salva.
3. A Vercel republica sozinha. Pronto.

Se a pasta `assets/engine-sim/` não existir ou der erro, o jogo usa o motor antigo (3 osciladores) sem quebrar.

## Como o motor é escolhido (por carro)
Ordem: campo `"engine"` em `assets/cars/cars.json` → texto de `"specs"` → campo `"cyl"`.

| Texto em `specs` | Motor |
|---|---|
| `V8` (+ `turbo`) | `v8cross` (`v8tt`); com `flat`/`plano`: `v8flat` |
| `V6` (+ `turbo`/`biturbo`) | `v6` (`v6tt`) |
| `V10` / `V12` | `v10` / `v12` |
| `Boxer 4`, `Flat-6` | `boxer4`, `flat6` |
| `rotativo`/`wankel` | `rotary2` |
| `diesel` + 6 cil. | `i6diesel` |
| só `N cil.` / `cyl` | 3→`i3`, 4→`i4`, 5→`i5`, 6→`i6`, 8→`v8cross`, 10→`v10`, 12→`v12` |

Para forçar um motor, adicione no carro: `"engine": "v8flat"`. Ids: vtwin i3 rotary2 i4 boxer4 i5 i6 i6diesel v6 v6tt flat6 v8cross v8tt v8flat v10 v12.

A classe do carro escolhe o chassi do som: Pickup/SUV→`truck`, Super→`supercar`, Muscle→`muscle`, Hatch→`hatch`, resto→`sports`.

Atenção: no `cars.json` atual o BMW M3 GTR diz "6 cil." e vira `i6`. Se quiser o V8 do M3 GTR, ponha `"engine": "v8flat"` nele.
