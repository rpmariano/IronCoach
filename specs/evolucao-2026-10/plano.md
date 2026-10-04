# Evolução — plano conjunto (2026-10-04)

> Factos reais em vez de fogo de artifício: cada número diz de que período é,
> sobre quantos dias/sessões, e só aparece quando há dados que o sustentem.
> Os gráficos mexem quando o atleta os vê, e os dados já estão prontos antes
> de ele entrar.

Base:
- O mock-up aprovado da Nutrição — artefacto "Evolução · Nutrição por período" (6 ecrãs: semana em curso/a começar, mês fechado/em curso, trimestre fechado/em curso).
- Auditoria dos 5 separadores e verificação adversarial: [`erros-verificados.md`](erros-verificados.md) — 38 erros, 34 confirmados + 4 parciais, 0 refutados (18 factos errados, 16 enganadores, 4 cosméticos).
- Investigação de animação e pré-cálculo (workflow `evolucao-animacao-precalculo`): inventário, ciclo de vida dos separadores, custo dos dados, desenho e 3 céticos (factos, viabilidade, UX) — 1 erro crítico e 4 altos corrigidos no desenho abaixo.

## 1. As regras (do mock-up da Nutrição, para todos os separadores)

| # | Regra | Hoje |
|---|---|---|
| R1 | Períodos de **calendário** — semana seg–dom, mês, trimestre — com ‹ › e o intervalo escrito ("28 set – 4 out · em curso") | Janelas rolantes (`filterByDateRange`): "Mês" = 5 set – 4 out; "esta semana" = 7 dias rolantes |
| R2 | **Hoje não entra nas contas** (só dias fechados), com a nota "Hoje ainda não acabou… toca em Dia" | Hoje entra sempre; um pequeno-almoço às 8h dá "Deficit crítico" |
| R3 | Toda a média diz o denominador: "média por dia registado (N dias)", "por sessão de força (N)", "N de M corridas com tempo" | Denominadores escondidos ou errados |
| R4 | Cumprimento em contagem: "X de N dias/semanas no objetivo" | Só médias |
| R5 | ▲/▼ face ao período anterior **equivalente e fechado**, só quando existe | ▲/▼ é distância ao objetivo, ou semana parcial vs completa |
| R6 | Mínimos de dados antes de qualquer %, estado ou tendência ("ainda é cedo para conclusões") | Estados a vermelho com 1–2 registos |
| R7 | Período que começa antes do primeiro registo diz "desde 13 jul" | — |
| R8 | Período corrente sem dias fechados (segunda, dia 1): estado "a começar" com o resumo do período anterior (ecrã "Semana · segunda-feira" do mock-up) | — |
| R9 | **Animação de entrada quando o gráfico fica à vista** (separador assente + no ecrã + dados prontos), repetida ao voltar ao separador; nada anima escondido; respeita *reduced motion* | 10 gráficos animam fora do ecrã; outros não animam |
| R10 | **Dados prontos antes de entrar**: vistas pré-calculadas em tempo morto, sem espera nem spinner ao entrar | Tudo calculado em `useMemo` no render, perdido ao sair |

## 2. Fundações partilhadas (antes de mexer nos separadores)

| ID | Entrega | Onde | Notas |
|---|---|---|---|
| F1 | **Motor de períodos de calendário**: `calendarPeriod(kind, todayISO, offset)` → `{start, end, lastClosed, closedDays, totalDays, isCurrent}`, `previousPeriod`, `closedDaysOf(p, today, dataStart)` ("desde"), `periodEarlyState`, `periodLabel`, `weeklyBuckets`, `weekdayAverages(minPerWeekday)` | `_shared/formulas/calendarPeriod.ts` (ver D3) | Substitui 6 cópias de "segunda-feira desta semana" espalhadas. Testes com `todayISO` fixo: segunda com 0 dias fechados, domingo, dia 1/31, mudança de trimestre, semana 29/12–04/01, mudança de hora. |
| F2 | `PeriodNavigator` (‹ rótulo ›) + `useCalendarPeriod`; `TimeFilterBar` com prop `options`; período de cada separador no store (sobrevive a sair e voltar) | `src/components/BI`, `src/store` | — |
| F3 | **Histórico de objetivos (#51) no store**, lido uma vez; `goalsResolver(day)`; `estimated = dia < 2026-10-03` (hoje sai `estimated` para sempre a quem nunca mudou de objetivos) | `src/store`, `src/utils/goalHistory.js` | Hoje só a vista Dia o lê. |
| F4 | **Paginação** de `meals` e `water_logs` no carregamento (o PostgREST corta em 1000 linhas e perdem-se as mais antigas sem aviso) | `src/store/index.js` | Risco latente (N8): ~6–7 meses de refeições; a água mais cedo. As setas de período param no primeiro dia completo. |
| F5 | **Animação ao ficar visível** (R9) — ver §2.1 | `Dashboard.jsx`, `useRevealAnimation.js`, `ChartFrame.jsx`, `chartSetup.js`, `introAnimations.js`, 13 gráficos, `RaceReadinessCard`, `PillarSummaryCard` | Só frontend — pode sair primeiro. |
| F6 | **Dados prontos antes de entrar** (R10) — ver §2.2 | `src/store/evolution/*`, `App.jsx`, `Layout.jsx`, os 5 separadores | Sem Web Worker. Feito **com** cada separador (não extrair os `useMemo` duas vezes). Não mexe em `_shared/formulas`. |

### 2.1 Animação ao ficar visível (F5) — desenho verificado

Hoje: os 4 gráficos de barras já animam ao ficar à vista; os outros (linhas, donut, scatter — 10) correm 1 s de animação **escondidos** no mount, voltam a correr ao aparecer e ignoram *reduced motion*; o anel e as barras da Prontidão não têm entrada nenhuma; 31 barras do mês demoram 2,35 s (sem teto no escalonamento).

O desenho foi atacado por 3 céticos (factos, viabilidade técnica, UX no telemóvel) com testes reais do Chart.js 4.5.1. Fica assim, já com as correções:

1. **Gatilho = separador assente + à vista + dados do separador prontos.** "Assente" só sem toque ativo e com `scrollLeft` alinhado à página (≤1 px); usa `scrollend` quando existe. "À vista" = `intersectionRect.height` (respeita a Análise Cruzada fechada e os cortes do carrossel) com ≥50–60% da **área do gráfico**, não do cartão. "Pronto" por fatia de dados (corridas, refeições…), não o `dataPending` global (que pode demorar 45 s por uma fatia que nada tem a ver).
2. **Chart.js:** o gráfico visível é criado quando o separador assenta (o construtor já anima a partir da base — no 1.º reveal não se chama mais nada); os dos separadores vizinhos são pré-criados em tempo morto, um por frame, já no estado zero. Ao sair: `stop()` → `reset()` → `draw()`; ao voltar: `stop()` → `reset()` → `update()` — **sem o `stop()` a animação em curso desfaz o reset e perde-se o escalonamento** (medido). Mudar de período: transição curta de 300 ms (`updateMode="period"`), sem repetir a entrada.
3. **`chartSetup.js`:** alterar o objeto de animação por omissão **no sítio** (`Object.assign`) — trocá-lo por um objeto novo rebenta o animador dos gráficos de linha e congela as animações da sessão (medido).
4. **Reduced motion** lido em tempo real (`useReducedMotion`) e aplicado às opções de cada gráfico (as opções do gráfico ganham ao `false` global). Com *reduced motion* nada anima, mas os gráficos continuam a ser criados só quando perto.
5. **Número grande:** enquanto armado mostra o estado zero (não o valor final que depois salta para 0 — o piscar corrigido a 13/09); contagem alinhada com o gráfico (~800 ms). `opacity:0`, nunca `visibility:hidden` (o valor tem de continuar no leitor de ecrã).
6. **Escalonamento com teto:** `delay = i × min(60, 450/(n−1))` — 31 barras em ~1 s.
7. **Prontidão (Geral):** anel com `stroke-dashoffset` e barras dos pilares com `scaleX` a partir de zero, % a contar, a voltar a zero ao sair.
8. **Fora da Evolução nada muda:** sem o contexto do separador, o hook mantém o comportamento atual (os badges do carrossel do Perfil continuam a rearmar).
9. **Sem jank no deslize** (pré-requisito): `React.memo` nos 5 separadores, `scrollToTab` estável, `data` dos gráficos memorizados, seletores em `App.jsx` e `Layout.jsx` (hoje subscrevem o store inteiro: cada deslize redesenha a App e os 5 separadores e faz `update()` a todos os gráficos já criados).

### 2.2 Dados prontos antes de entrar (F6) — desenho verificado

1. **Vistas pré-calculadas** por separador e período (corrente e anterior, para os ▲/▼) numa cache **fora do React e fora do zustand** (`src/store/evolution/{core,cache,views/*}.js`), preparada em tempo morto depois do carregamento — um separador por fatia (último aberto → Geral → resto), com `deadline.timeRemaining()` e pausa durante toque/scroll; recalcula à mudança de dia (temporizador até à meia-noite + regresso à app). Cálculos partilhados entre separadores (ACWR, tendência de peso, VDOT) feitos uma vez.
2. **Invalidação barata**: impressão digital por lista numa `WeakMap`, calculada em tempo morto (não comparar JSON de 1000 refeições dentro do carregamento, a seguir a cada gravação); inclui o `profile` e o histórico de objetivos (hoje cada recarga cria um `profile` novo e invalidaria tudo).
3. **Tudo o que hoje se calcula ao montar entra na cache**: prontidão e plano de prova, insights (partilhados entre o banner e o aviso da Carol), Análise Cruzada só quando aberta.
4. **Histórico de objetivos (#51) carregado com o resto** (hoje só ao abrir a vista Dia da Nutrição — a vista muda depois de entrar).
5. **Primeira entrada sem os ~300 ms do `React.lazy`**: o código do Dashboard sobe para 1.º na fila de pré-carregamento e, quando já está carregado, é desenhado diretamente (o `lazy` fica só como recurso) — pré-carregar o ficheiro não chega, o `lazy` suspende sempre no 1.º render (medido no código do React 19).
6. **Período de cada separador num store pequeno à parte** (não no `useAppStore`, senão cada seta redesenha a App inteira); depois de cada seta, prepara-se em tempo morto o período vizinho.
7. Se a cache falhar, calcula-se como hoje — nunca spinner. Sem Web Worker: o custo dominante é criar os canvas (resolvido em §2.1); o cálculo é de dezenas de ms; a decisão revê-se se uma vista passar de 16 ms com o CPU 6× mais lento e um ano de dados.

## 3. Por separador

### Nutrição — implementar o mock-up
- Seletor **Dia · Semana · Mês · Trimestre** (sai 6 Meses/Ano), com ‹ ›, R2, R8.
- Bloco-resumo de 5 linhas (com **Água**, ≥3 dias para média): média por dia registado vs objetivo **de cada dia** (F3), Dentro/Abaixo/Acima com %, "dias no objetivo X de N"; tocar numa linha escolhe o que os gráficos mostram.
- Veredicto factual + "calorias e proteína no objetivo em X de N dias · ▲/▼ vs período anterior"; nota "Objetivos aproximados" quando há dias antes de 3 out.
- Semana: barras diárias com a zona 90–115%. Mês: mapa de calor Dentro/Abaixo/Acima/Sem registo com marca de dia de treino. Trimestre: médias por semana, dias no objetivo por semana, calorias por dia da semana (≥4 de cada).
- "Comer para treinar" (≥7 dias fechados no mês, ≥14 no trimestre), EA só em dias fechados **com refeições**, lista dos dias de treino abaixo de 30.
- Micronutrientes: média por dia do período certo (hoje Trimestre/6M/Ano mostram a soma de 1–4 out, com o rótulo "· 6meses").
- Uma só régua de cor e veredicto (90–115; a proteína sem teto), em vez de 3 réguas contraditórias.
- Corrige: N1–N7. **Cobertura dos micronutrientes ("dado em 54% dos alimentos")**: impossível hoje — a análise grava 0 quando falta o valor. Ver D6.

### Corrida
- Factos errados a corrigir já (não dependem dos períodos): **R2** previsão de prova "00:00" (usar o mesmo pipeline do hub, que filtra corridas sem tempo, e dizer em que corrida se baseia); **R3** "na última" é a corrida mais antiga (ordem do store); **R4** pace médio mais rápido que o real (km de corridas sem tempo no denominador → "N de M corridas com tempo"); **R6** "6mêses"; **R7** "Tenho uma corridas"/"zero corridas registadas" com histórico; **R8** alvo 80/20 a 95% no donut e 80% na Carol para quem não declarou nível.
- **R1**: um só ACWR no ecrã — o gráfico passa a semanas fechadas (a semana em curso tracejada "em curso") e o cabeçalho usa o mesmo número do KPI; limiares iguais aos de `acwr.ts`.
- R5/R10: barras com o mesmo intervalo dos KPIs (hoje: 8 barras na semana, dias que contam no total sem barra); "zona segura" só com ACWR com dados.
- R9: "5 km+" passa a "≈5 km (4–6,5)".
- Períodos de calendário em KPIs, barras e cartão de relógio; ACWR, VDOT e recordes ficam fora do período e dizem-no ("últimas 12 semanas", "de sempre"); veredicto VDOT compara período com o anterior (≥3 pontos), não com a 1.ª corrida de sempre.
- Mantém: mínimo 3 de 4 semanas do ACWR, semanas seg–dom do gráfico, regra do veredicto que exclui a semana incompleta (é o modelo para os outros).

### Ginásio
- Factos errados: **G1** "Séries por músculo" conta cada série em todos os grupos da sessão (Peito+Tríceps 20 → 20+20) → atribuir por exercício, ou contar só sessões de um grupo, e mostrar séries/semana; **G2** veredicto divide pelas semanas nominais do filtro (3 sessões em "Ano" = "3 em 52 semanas") → semanas fechadas desde o 1.º registo, só força; **G3** "kg esta semana" é a última semana *com* dados (pode ter meses); **G5** ACWR do ginásio dá "Perigo" com 2 sessões.
- **G4** delta e "média 4 semanas" sobre semanas fechadas, com zeros; **G6** RPE por modalidade nunca aparece (bug de nome de campo); **G7** "0 min" quando nenhuma aula tem duração → "—".
- **Fogo de artifício a retirar (D5)**: KPI "Vol. Carga" e gráfico "Volume diário" somam kg de exercícios diferentes (agachamento + curl) — trocar por progressão por exercício (melhor série / 1RM estimado, que já existe); ACWR do ginásio fora até ter ≥3 de 4 semanas de força.
- Seletor Semana · Mês · Trimestre (sai Dia).

### Corpo
- Factos errados: **C1** "kg/semana" não é por semana (2 pesagens a 3 dias = "0,6 kg/semana") e alimenta a frase *danger* "perder depressa demais", o pilar e o insight do Geral → declive por dia × 7 com ≥3 pesagens em ≥10–14 dias; **C2** "O peso estabilizou" com pesagens espaçadas (80→74 kg); **C3** "Composição corporal" com avaliações sem gordura medida (gordura 0, "+14 kg de massa magra"); **C5** valor de sempre, sem data, mostrado como do período.
- **C4** "72.4 kg kg"; três "pesos atuais" diferentes (cartão, EWMA do período, EWMA de sempre no Geral) → um só: a última pesagem, com data.
- Deltas vs período anterior, com limiar de ruído (BIA) e ≥2 leituras em ≥14 dias; gráfico "Peso" duplicado sai; eixo temporal real.
- Para o Corpo, R2 aplica-se a médias: uma pesagem de hoje é um facto fechado e pode ser a "última".

### Geral
- Período: **semana de calendário, dias fechados**, com ‹ › (D2); os pilares abrem o separador **no mesmo período**.
- Factos errados: **O4** pilar Corpo "Estável · 0 kg/sem" com uma pesagem; **O5** "Eficiência aeróbica vs peso" emparelha quase sempre o 1.º peso de sempre (bug `localeCompare`).
- **O1** pilar Nutrição com hoje parcial e objetivo inventado de 2000 kcal → só dias fechados, "X de N dias", sem objetivo → sem %; **O3** "kg/sessão" divide também pelas aulas; **O6** "Impacto do Ginásio na Corrida" com RPE 5 inventado e "Boa gestão… Continua assim!" a quem nunca registou RPE → só com RPE real (D5); **O7** lista "O que falta para começar" que nunca passa de "0 de N" (vai para o Início, ver plano de onboarding); **O8** prontidão "100% Alta" com um só pilar → exigir ≥2 pilares de treino/nutrição.
- **O2** "2 sessãoões", "2 avaliaçãoões".
- Insights: "1,60 vezes acima" → "1,6× o habitual (+60%)"; alertas de gordura com data e ignorados com >30 dias; falso "Risco de RED-S" (EA com dias de treino sem refeições) desaparece com a correção da EA.
- Já feito nesta branch (commit `269072c`): prontidão "a calibrar" sem pilares com dados, "conta com X de N pilares", ACWR "faltam N sem.".

## 4. A Carol diz os mesmos números errados

As fórmulas com erro vivem em `supabase/functions/_shared/formulas/` e são lidas pela `coach-chat`: `weightTrend` (C1/C2), `compositionTrend` (C3), `energyAvailabilityWindow` (N4), `muscleGroupVolume` (G1), `volumeLoad` (G5), `crossMetrics` (O6), `racePrediction` (R2). Corrigi-las corrige o ecrã **e** a Carol — mas cada push a `dev` com estes ficheiros é deploy em produção, e `dev`/`master` não podem divergir neles. Ver D3.

## 5. Ordem de entrega

| Fase | Conteúdo | Toca no servidor? | Risco |
|---|---|---|---|
| 0 | Já na branch: prontidão "a calibrar" (+ O8, ≥2 pilares) | Sim (`readinessIndex`, `coach-chat`) | Baixo, testado (3555 testes) |
| 1 | **Correções rápidas de factos errados** que não dependem dos períodos: R2, R3, R4, R6, R7, R8, G1, G6, G7, C4, O2, O5, e as fórmulas C1/C2/C3/N4/G5/O6 com testes e goldens novos | Sim | Médio — muda o que a Carol diz; vai a `dev`+`master` juntos |
| 2 | F5 **animação ao ficar visível** | Não | Baixo |
| 3 | F1–F4 + F6 (infra) — motor de períodos, navegação, histórico de objetivos, paginação, cache | F1 sim (se D3 = partilhado) | Médio |
| 4 | **Nutrição** = mock-up | Não (funções novas ao lado das da Carol) | Médio |
| 5 | Corrida → Ginásio → Corpo, um por commit, cada um com a sua vista pré-calculada | Não | Médio |
| 6 | Geral (depende dos outros) + insights | Talvez | Médio |

Cada fase: `npm run build`, `npm test`, revisão `pre-deploy-reviewer` antes de `master`, e o mock-up atualizado com os ecrãs dos outros separadores antes de os implementar (fase 5 e 6).

## 6. Decisões

D2–D6 aprovadas como recomendado (2026-10-04); D1 aprovada com a alteração do Corpo.

| | Pergunta | Recomendação |
|---|---|---|
| D1 | Seletor por separador | **Aprovado com alteração (2026-10-04):** Nutrição: Dia/Semana/Mês/Trimestre. Corpo: **Dia**/Semana/Mês/Trimestre/Ano — o "Dia" do Corpo é uma **avaliação**: ‹ › saltam entre avaliações (não dias vazios), cada métrica com a diferença face à avaliação anterior e um seletor "Comparar com…" para escolher qualquer outra (ex.: a de há 3 meses, a primeira de sempre); uma pesagem de hoje é um facto fechado e conta. Corrida: Semana/Mês/Trimestre/Ano. Ginásio: Semana/Mês/Trimestre. Sai "6 Meses" de todos. |
| D2 | O Geral passa a ter período? | Sim: semana de calendário com ‹ ›, e os pilares abrem o separador nesse período. |
| D3 | Motor de períodos e correções das fórmulas: partilhados com a Carol (`_shared/formulas`) ou só no ecrã? | **Partilhados.** A Carol diz hoje os mesmos números errados; uma só régua é a regra do projeto. Custo: as fases 1 e 3 vão a `dev` e `master` juntas, com a tua autorização. |
| D4 | Animação: repetir sempre que se volta ao separador, ou só na 1.ª vez por sessão? | **Sempre que o separador assenta**, só para o que está à vista; nunca no scroll vertical nem ao mudar de período (aí só uma transição curta de 300 ms). Se se voltou ao separador há menos de ~3 s (vai-e-vem rápido), não repete. |
| D5 | Retirar o que não tem leitura útil: "Vol. Carga" e "Volume diário" (Ginásio), ACWR do ginásio, gráfico "Peso" duplicado (Corpo), "Impacto do Ginásio na Corrida" sem RPE real (Geral) | Retirar e substituir por progressão por exercício (Ginásio); o resto só volta com dados reais. |
| D6 | Micronutrientes: mostrar cobertura ("dado em X% dos alimentos") exige gravar `null` quando o valor falta (hoje grava 0) | Mudar a `analyze-meal` para `null` daqui para a frente; até lá, só "São mínimos: alimentos sem esta informação contam como zero". |
