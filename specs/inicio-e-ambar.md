# Início mais leve e a dieta do âmbar

Decidido em 2026-09-14/15 sobre o canvas "IronCoach — Início e o âmbar da prova"
(https://claude.ai/artifact/NbHMkqfbCw2vBWdcPMvEea, pranchas "Início — proposta",
"Provas — proposta", "Prova concluída — antes e depois"). Só interface: sem
dados novos, sem Edge Functions, sem migrações. O Palmarés que aparece na
prancha "Provas — proposta" é substituído pelos medalhões — ver
`palmares-medalhoes.md`.

## Porquê

1. **O Início tinha texto a mais** e os cartões da Carol e de "O que faço hoje"
   eram divididos ao meio por um fio, sem que as duas metades se distinguissem.
2. **O âmbar deixou de dizer "é a prova"**: nome, número, botões, link, datas,
   prémios — tudo âmbar no mesmo cartão, e o separador Provas inteiro âmbar.

## Regra do âmbar

O âmbar é a **identidade** da prova, não a mobília. Por cartão, no máximo dois
elementos âmbar: o rótulo/nome da prova e o trilho (ou o troféu). Números,
botões, links, mosaicos de data e prémios passam a neutro. A borda e o brilho
do `GlassCard tone="race"` mantêm-se (brilho de .16 para .12).

Exceções que continuam âmbar cheio, por serem a ação única do momento:
"Registar a prova" (`race-card-register`) e "Abrir o plano da prova"
(`carol-card-action`).

No separador Provas só o cartão "Para onde vou" é âmbar. O ouro legítimo que
sobra no ecrã é o dos medalhões.

## Início

### `Home/CarolCard.jsx` — um bloco só

- Sai o cabeçalho separado: o subtítulo "a tua treinadora", o ícone
  `Sparkles` e o fio `borderTop` entre cabeçalho e resumo.
- Layout: `CoachAvatar` 34px à esquerda, alinhado ao topo; à direita, linha
  "Carol" (12px/800, `--coach-soft`) com o `ChevronRight` encostado à
  direita, e por baixo a mensagem (13px/500, `--text-1`, `line-height` 1.5,
  fechada a duas linhas) e "Ler mais".
- Toda a linha do nome continua a abrir o chat (`onOpenCoach`), com alvo ≥44px.
- O estado expandido (várias secções com rótulo) não muda.

### `Home/DayPlanCard.jsx` — a navegação do dia numa faixa própria

- O cabeçalho (setas + data) passa a uma faixa de largura total no topo do
  cartão: `background: rgba(255,255,255,.03)`, `border-bottom: 1px solid
  rgba(255,255,255,.08)`, setas nas pontas, data ao centro (11.5px/800,
  uppercase, `letter-spacing .06em`). O corpo do cartão fica com o seu próprio
  padding por baixo. É isto que separa "navegar entre dias" de "o dia".
- Sai o `Badge` "Hoje": o rótulo da secção já diz "O que faço hoje". O estado
  do dia (`dayStatus`) passa a colorir a data — `--gym` quando está por fazer,
  `--ok` feito, `--warn` falhado, âmbar no dia da prova.
- Sai a pré-visualização de duas linhas da refeição (`previewMeal`); fica só a
  linha "Refeições sugeridas · Ver as N", que abre a persiana como hoje.
- Título sem parêntesis: "Corrida longa · 14 km" em vez de "Corrida (longa,
  14 km)" (`dayTitle` em `utils/homeModels.js`).

## Âmbar

### `Home/RaceCard.jsx`

- Contagem: número em `--text-1`, "dias" em `--text-4` (eram âmbar).
- `RaceTrail`: o rótulo da fase ativa passa a `--text-2`; o traço feito, os
  pontos e o marcador continuam âmbar.
- `AllRacesLink`: texto `--text-3`, peso 700, fio `rgba(255,255,255,.09)`,
  chevron `--text-4`.

### `ProvaConcluidaCard` (no mesmo ficheiro)

- Troféu em tinta (`--tint-race-bg/bd`, ícone `--race`) em vez do
  `--grad-race` cheio.
- A ordem ("3.ª") em `--text-1`, "prova" em `--text-4`.
- Chips das conquistas neutros (`rgba(255,255,255,.06)`, borda
  `--border-glass-strong`, texto `--text-2`) com o **glifo** na cor do
  significado — altera o `AchievementChip` (ou uma variante `neutral`).
- "Ver memórias" neutro, igual a "Próxima prova".

### `Run/RaceListCard.jsx`

- `GlassCard` sem `tone` (borda neutra); `SectionLabel` "As tuas provas" e o
  grupo "Próximas" sem `tone="race"`; `Flag` em `--text-4`.
- `DateTile` das próximas e por registar: `rgba(255,255,255,.06)`, borda
  `--border-glass-strong`, texto `--text-2`. As concluídas ficam como estão.
- "Marcar prova" neutro.
- O selo "Registar" continua em `--warn`.

## Verificação

- Testes existentes que procuram cores (`RaceCard.test.jsx`,
  `DayPlanCard.test.jsx`, `CarolCard.test.jsx`) — ajustar, não apagar.
- No browser, com `?demo=true`: Início (dia normal, dia da prova, dia seguinte
  à prova), separador Provas. Contraste AA de `--text-4` sobre o vidro já foi
  medido no ponto 2 do redesenho; nada novo aqui abaixo de 11px.
