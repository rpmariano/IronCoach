# Handoff: IronCoach — novo UI/UX (direção 6c)

## Overview

Redesenho completo da interface da IronCoach, PWA de treino para corredores amadores com um coach de IA ("a Carol"). Resolve dois problemas do UI atual — os blocos não se ligavam entre si e a app lia-se como escura e baça — e aplica uma linguagem única a todos os ecrãs: fundo de curvas de nível com gradiente ambiente, cartões de vidro sem moldura branca, uma cor por significado, e a pílula elástica ("minhoca") como assinatura de navegação. Inclui estados que a app não tinha (primeiro dia, sem dados, espera, erro, onboarding, pós-prova) e um guia de personalidade para a Carol.

**Repositório alvo:** rpmariano/IronCoach (React 18 + Vite + Tailwind 4, Zustand, lucide-react, Supabase). Pasta local `IronHealth-claude/`. Ver `design/github.md` para o mapa de ficheiros de origem.

## About the Design Files

Os ficheiros em `design/` são **referências de design em HTML** — mocks que mostram o aspeto e o comportamento pretendidos, não código para copiar. A tarefa é **recriar estes ecrãs no codebase React existente**, usando os componentes, o store e os padrões que já lá estão (`Layout.jsx`, `Home.jsx`, `*Registration.jsx`, `useElasticPillIndicator`, etc.).

Os ficheiros em `design-system/` são diferentes: **tokens CSS e componentes React de referência**, escritos para serem portados. Os `.jsx` usam `style` inline e variáveis CSS; podem ser traduzidos para classes Tailwind ou usados como estão. Os `.d.ts` documentam as props; os `.prompt.md` explicam o uso.

**Não inventar funcionalidades.** Todos os ecrãs, botões e campos dos mocks existem no código atual ou foram decididos explicitamente nesta fase (estados vazios, onboarding, pós-prova). O que não está nos mocks não se acrescenta.

## Fidelity

**High-fidelity.** Cores, tipografia, espaçamentos, raios, sombras e tempos de animação são finais e estão nos tokens. Recriar com exatidão. Duas exceções assumidas:
- O **retrato da Carol** (avatar com três expressões) ainda não existe — usar o ícone `message-circle` provisório e deixar o ponto de substituição preparado (`CoachAvatar`, prop `mood`).
- O **foco de teclado** não está desenhado: aplicar anel de 2px na cor do contexto a todos os controlos.

## Ordem de trabalho

Por esta ordem. Cada passo é entregável sozinho.

1. **Tokens e moldura.** Substituir as variáveis de `src/styles/globals.css` pelos tokens de `design-system/tokens/`. Mover o fundo (gradiente ambiente + curvas SVG + fade) para `Layout.jsx`, uma vez, por baixo de tudo. Tirar a `border: 1px solid rgba(255,255,255,.8)` de todos os cartões (`.card`, `NextRaceCard.css`, `HydrationOptionA.css`, `CoachDailySummaryCard.css`, `RaceHubView.css`).
2. **Piso de texto e toque.** 11px mínimo em todo o texto; 44px mínimo em toda a ação. Barra de ação fixa (`ActionBar`) nos ecrãs de edição: 4 separadores do Perfil e 5 registos.
3. **Cor com significado.** Âmbar só para a prova. Avisos passam a coral `#fb7c4d` (`Warning`). Módulos: corrida `#2ee0ff`, ginásio `#9ec3d2`, nutrição `#c77dff`, corpo `#ff5fa8`. Remover emoji dos pilares do Dashboard.
4. **Navegação.** `BottomNav` com pílula de 4px em gradiente e brilho; `SubNav` nos Dashboards e Perfil com pílula a 320ms na cor do módulo. `useElasticPillIndicator` já existe — parametrizar a duração.
5. **Início.** Cartão da Carol (ciano, "Ler mais"), plano do dia com carrossel de dias e um botão "Registar sessão", persiana das 6 refeições, cartão da prova com `RaceTrail` e carrossel de provas, órbita (`Orbit`) só leitura — o +250 de água sai; regista-se pelo FAB.
6. **Dashboards.** Frase de veredicto no topo de cada módulo. Prontidão com o bloco da prova. Gráficos com etiquetas fora do SVG.
7. **Estados.** Início no primeiro dia, Dashboard sem dados, refeição a analisar e falhada, hub pós-prova.
8. **Onboarding.** 6 passos conduzidos pela Carol, no primeiro acesso e reentrável em Perfil · Coach.
9. **Animações.** As 8 de `IronCoach - Animacoes.dc.html`, uma vez por sessão (`sessionStorage`), com `prefers-reduced-motion`.
10. **A Carol.** Aplicar `design/CAROL.md` ao prompt do sistema e ao chat: memória citada, opinião, reação a eventos, "a escrever…", sem emoji.

## Screens

36 ecrãs em `design/IronCoach - App.dc.html`. Todos a 390×844, header 85px, nav 76px, padding lateral 16px, gap 12px entre cartões (8px no Início). Cada ecrã tem o ficheiro de origem ao lado do título. Os textos dos mocks são finais — não reescrever.

| Secção | Ecrãs | Origem |
|---|---|---|
| Início e sobreposições | Início · FAB aberto · Persiana 6 refeições · Popup insights | Home.jsx, Layout.jsx, CoachInsightButton |
| Separadores | Calendário · Dashboard Visão Geral · Coach | Calendar.jsx, OverviewDashboard.jsx, Coach.jsx |
| Perfil | Perfil · Popup dispensar aviso · Metas · Equipamento · Coach | Perfil.jsx (TAB_KEYS) |
| Registos | Corrida · Refeição · Treino · Avaliação | *Registration.jsx |
| Provas | Prova nova · Hub de prova | RunAgenda.jsx, RaceHubView.jsx |
| Submenus do Dashboard | Corrida · Ginásio · Nutrição · Corpo | *Dashboard.jsx |
| Admin (oculto) | Visão Geral · Persiana Análise Cruzada | Admin.jsx (duplo clique no logo, isAdmin) |
| Avisos | A régua (preterida) · B coral (aplicada) | — |
| Estados em falta | Início 1.º dia · Dashboard sem dados · Refeição a analisar · Refeição falhou · Onboarding 3 · Hub pós-prova | novos |
| Onboarding · o arranque | 1 Quem é a Carol · 2 Quem és · 4 Como corres · 5 Como comes · 6 A tua prova · Fecho | novos |

## Interactions & Behavior

- **Minhoca** (nav e subnavs): 45% do tempo a esticar até cobrir origem e destino (easeOutCubic), 55% a contrair no destino (easeOutBack, overshoot 1.70158). Nav: `min(950, 420 + 130·distância)` ms. Subnav: 320 ms. Nunca duas em movimento ao mesmo tempo. Referência: `design-system/components/navigation/ElasticPill.jsx`.
- **Conteúdo segue a pílula**: ao trocar de separador, o painel entra com `translateX(14px) → 0` + opacidade, 280 ms.
- **Persiana**: sobe 340 ms (`cubic-bezier(.16,1,.3,1)`), fecha 240 ms, scrim 62% + blur 3px em sincronia. Arrastável.
- **Popup**: scale .96→1 + opacidade, 220 ms.
- **FAB**: roda 45° ao abrir; menu de 5 pílulas (Nova prova, Registar refeição, Nova avaliação, Nova corrida, Novo treino), cada uma na cor do módulo.
- **Confirmação de registo**: check com spring (`cubic-bezier(.34,1.56,.64,1)`, 420 ms, overshoot 1.12), sai aos 900 ms e devolve ao Início.
- **Toque**: scale .98 em 120 ms.
- **Carrosséis** (dias, provas): setas ‹ › de 44px; pontos por baixo só com mais de um item.
- **Entrada** (uma vez por sessão): anéis 1100 ms stagger 80; números contam 1400 ms; barras 550 ms stagger 60; trilho avança 1600 ms quando a semana muda.
- **A Carol respira**: halo 2600 ms, três ciclos e para — só com assunto por resolver.
- **`prefers-reduced-motion`**: tudo a 120 ms ou zero.
- **Espera**: esqueleto + spinner no botão ("A analisar…"). **Erro**: `Warning` coral com "Tentar de novo" e alternativa manual; dados do utilizador nunca se perdem.

## State Management

Já existe no store Zustand (`useAppStore`): `activeTab`, `lastDashboardTab`, `openCreationMode`, `isAdmin`, `profile`, planos, registos. Novo:
- `onboardingDone: boolean` no perfil — o onboarding corre quando falso; Perfil · Coach → "Rever o arranque" reabre-o preenchido.
- `introAnimationsPlayed` em `sessionStorage`.
- `coachHasPendingTopic: boolean` — liga o halo e o cartão "A Carol precisa de falar contigo".

## Design Tokens

Completos em `design-system/tokens/`. Resumo:

**Cor** — fundo `#0b1120`; header `rgba(4,8,15,.92)`; nav `rgba(15,23,42,.72)`; persiana/popup `#111a26`; cartão `rgba(255,255,255,.05)` + borda `rgba(255,255,255,.10)`. Texto `#f8fafc` / `#e2e8f0` / `#cbd5e1` / `#9aa5b4` / `#8b96a4` / placeholder `#75808f`. Marca `#7fb3c7`. **Significados:** prova `#fbbf24` (deep `#d97706`, tinta `#1a1206`); Carol `#22d3ee` (deep `#0e7490`, soft `#a5f3fc`, tinta `#04252b`); corrida `#2ee0ff`; ginásio `#9ec3d2`; nutrição `#c77dff`; corpo `#ff5fa8`; ok `#34d399`; aviso `#fb7c4d` (soft `#fed7c3`); erro/admin `#f87171`. Tintas: cor a 16% fundo + 40% borda.

**Tipo** — sistema (`ui-sans-serif, system-ui`). 11 / 12,5 / 13,5 / 14,5 / 16 / 20 / 25 / 28 px; números 26 e 44 px. Pesos 500 / 700 / 800 / 900. Eyebrow: 11px 800 uppercase tracking .14em. Números tabulares.

**Espaço** — base 4. Toque 44 / 46 / 52. Header 85, nav 76, barra de ação a 76 do fundo, scroll padding-bottom 112 (168 com barra).

**Raio** — 7 / 11 / 14 / 18 / 20 / 24 / 28 / 40 / pill.

**Sombra** — cartão `0 12px 32px rgba(0,0,0,.3)`; persiana `0 -14px 40px rgba(0,0,0,.6)`; popup `0 24px 60px rgba(0,0,0,.6)`; FAB `0 4px 20px rgba(251,191,36,.35)`; pílula `0 0 9px rgba(34,211,238,.55)`.

**Blur** — cartão 20, chrome 40, barra de ação 30, scrim 3.

## Assets

- Ícones: **lucide-react** (já no projeto). Nomes dos mocks = Lucide 0.451.
- Fundo: SVG inline de 8 paths (curvas de nível), em `ScreenFrame.jsx`. Não é imagem.
- Logo: glifo `activity` sobre gradiente `#1e333d → #2d4a57`, cor `#eccea4`. Wordmark em texto.
- Sem fotografias nem ilustrações. Retrato da Carol por fazer (`CAROL.md` §4).

## Auditoria

`design/IronCoach - Auditoria UX-UI.dc.html` lista 12 achados. Os 3 erros e a maior parte dos riscos **já foram corrigidos nos mocks**; fica para o código o ponto 11 (foco de teclado e `input` reais em vez de `div`). Ler antes de começar — explica o porquê de várias decisões.

## Files

```
design/
  IronCoach - App.dc.html             36 ecrãs de referência (abrir no browser; precisa de support.js ao lado)
  IronCoach - Animacoes.dc.html       as 8 animações a correr, com tempos
  IronCoach - Auditoria UX-UI.dc.html 12 achados e o que foi corrigido
  IronCoach - Ecras atuais.dc.html    o UI anterior, recriado do código, para comparação
  CAROL.md                            personalidade e comportamento do coach
  github.md                           mapa ecrã → ficheiros do repositório
  support.js, doc-page.js             runtime dos ficheiros .dc.html
design-system/
  readme.md                           fundamentos de conteúdo, visuais, iconografia, índice de componentes
  SKILL.md                            instruções para usar o sistema no Claude Code
  styles.css + tokens/*.css           todas as variáveis
  components/{core,navigation,feedback,patterns}/*.jsx|.d.ts|.prompt.md
  guidelines/*.card.html              15 cartões de fundamentos
```
