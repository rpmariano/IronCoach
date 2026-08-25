# Checklist de validação — Biblioteca de fórmulas centralizada

> Acompanha [`formulas-centralizacao.md`](./formulas-centralizacao.md). Cada caixa
> é verificável por leitura de código ou execução de comando — nada de "parece
> bem". O projeto **não tem linter** (sem ESLint, sem script `lint` em
> `package.json`) — a aplicação destas regras assenta inteiramente em testes.

---

## Fase A — Bloqueadores P0 (produção, hoje)

Cada um: ficheiro:linha, o que corrigir, como provar antes/depois. Nenhum depende
da biblioteca — são correções pontuais no sítio onde já estão.

- [ ] **P0-1 — Género no `coach-daily-summary`.**
  `supabase/functions/coach-daily-summary/index.ts:347,423,446` comparam
  `gender === "masculino"` / `"feminino"`; `profiles.gender` só grava `'M'`/`'F'`
  (`src/components/Perfil/Perfil.jsx:452-453`).
  - Corrigir as 3 comparações para aceitar `'M'`/`'F'` (idealmente via
    `normalizeGender`, ver Fase B) — alinhar com `coach-chat:1849,1902`, que já
    trata isto bem.
  - Teste antes: chamar `computeBodyMetrics`/TMB com `gender: 'M'` e
    `gender: 'F'` reais e confirmar que hoje dão o mesmo TMB (prova do bug).
  - Critério de aceitação: `gender: 'M'` usa `+5`, `gender: 'F'` usa `-161`;
    limiar RED-S 8% para `'M'`, 16% para `'F'`.

- [ ] **P0-2 — Banda de cautela do ACWR morta.**
  `src/utils/biEngine.js:53` usa `ratio > Constants.ACWR_CAUTION_MAX` (1.49) na
  condição de `'caution'`; devia ser `ratio > Constants.ACWR_SAFE_MAX` (1.30).
  - Teste antes: `resolveAcwrStatus(1.35)` hoje devolve `'safe'`; deve devolver
    `'caution'`.
  - Critério de aceitação: `(0.80, 1.30] → safe`, `(1.30, 1.50] → caution`,
    `> 1.50 → danger`, `< 0.80 → undertrained` — testar as 4 fronteiras exatas
    (0.80, 1.30, 1.50).

- [ ] **P0-3 — Três ACWR incompatíveis no mesmo prompt.**
  `biEngine.js:92` (sRPE) vs `coach-chat:911-918` (km, janela 8d/29d) vs
  `coach-daily-summary:391-400` (km, janela 7d/28d). `Coach.jsx:380` envia os
  insights do frontend (sRPE) para o mesmo prompt que já tem o ACWR do backend
  (km) — sem indicar que medem grandezas diferentes.
  - Decisão a tomar primeiro (ver `formulas-centralizacao.md` §5.1): km ou sRPE.
  - Até a decisão ser tomada e implementada: no mínimo, rotular os dois ACWR no
    prompt como grandezas distintas (ex.: "ACWR por sRPE (frontend)" vs "ACWR
    por km (7d/28d)"), para a Carol não os tratar como o mesmo número.
  - Critério de aceitação: um só ACWR chega ao prompt, ou os dois chegam
    claramente rotulados como medindo coisas diferentes.

- [ ] **P0-4 — TDEE: dois fatores de atividade.**
  `coach-chat/index.ts:1908` usa `TMB × 1.3 + custo_corrida`;
  `coach-daily-summary/index.ts:449` usa `TMB × 1.55`, sem custo de corrida.
  - Teste: perfil de 70kg/175cm/30 anos/M, TMB≈1723. `coach-chat` com 0 km/sem
    dá GETD 2240; `coach-daily-summary` dá TDEE 2671 — 431 kcal de diferença
    para o mesmo atleta, no mesmo dia.
  - Corrigir para o fator único decidido em `formulas-centralizacao.md` §5.4.
  - Critério de aceitação: as duas edge functions dão o mesmo valor (±1 kcal de
    arredondamento) para o mesmo perfil e mesmo volume semanal.

- [ ] **P0-5 — `todayISO` em UTC no pilar Tático.**
  `src/utils/biEngine.js:1141`, dentro de `calculateReadinessIndex`, usa
  `new Date().toISOString().slice(0, 10)` em vez do `todayISO()` local de
  `src/lib/utils.js:3`.
  - Teste: simular `Date.now()` entre 00:00–01:00 (hora de Lisboa, horário de
    verão) e confirmar que este `todayISO` difere do de `lib/utils.js` nesse
    intervalo.
  - Critério de aceitação: `calculateReadinessIndex` importa e usa
    `todayISO()` de `lib/utils.js`, sem redefinição local.

- [ ] **P0-6 — Nutrientes sem fallback em `calculateMacroAdherence`/`calculateEnergyAvailability`.**
  `biEngine.js:594-600` e `:665-668` leem só `item.calories_per_100g` etc.;
  `nutrition.js:40` (`itemNutrients`) tem 3 níveis de fallback
  (`*_per_100g` → `food_item.*` → `*_100g`) mais macros diretos no item.
  - Teste: refeição com `meal_items[0].food_item.calories` preenchido mas sem
    `calories_per_100g` — `mealNutrients` (via `itemNutrients`) conta as
    calorias; `calculateMacroAdherence` hoje conta 0.
  - Corrigir substituindo o cálculo inline por `itemNutrients`/`mealNutrients`.
  - Critério de aceitação: os dois cálculos dão o mesmo total para a mesma
    refeição, incluindo os 3 formatos de origem do dado.

- [ ] **P0-7 — Viabilidade do `RunAgenda` sem correção "plano em curso".**
  `src/components/Run/RunAgenda.jsx:155-166` calcula `weeksToRace` cru
  (`Math.floor((raceDate−hoje)/7d)`), sem a correção que
  `racePlanEngine.js:202-207`, `biEngine.js:952-955` e `biEngine.js:1152-1155`
  já têm (usar `totalWeeks` do plano quando o treino já começou), e sem passar
  `racePriority` a `assessRaceViability`.
  - Teste: prova a meio da preparação (plano já começado) — `RunAgenda` marca
    `tempo_insuficiente`; `RaceHubView`/`Home` não.
  - Corrigir para reutilizar a mesma lógica (idealmente extraindo-a como função
    T2 partilhada, não copiada uma 4.ª vez).
  - Critério de aceitação: os 4 sítios dão a mesma flag de viabilidade para a
    mesma prova/runs/data.

- [ ] **P0-8 — `calculateTrainingDistribution` sem nível.**
  `src/components/Run/RunDashboard.jsx:141` chama
  `calculateTrainingDistribution(periodRuns)` sem o 2.º argumento
  (`experienceLevel`), caindo no default `'medio'` (alvo 80/20).
  - Teste: atleta `iniciante` (alvo 95/5) — donut do `RunDashboard` avalia
    contra 80/20; `detectCoachInsights` (`biEngine.js:823`, que passa o nível
    certo) avalia contra 95/5. Resultados de conformidade podem divergir para
    os mesmos dados.
  - Corrigir passando `profile.experience_level`.
  - Critério de aceitação: o donut e o insight da Carol concordam sobre
    "conforme"/"não conforme" para o mesmo atleta e período.

**Verificação de saída da Fase A:**
- [ ] `npx vitest run` continua verde.
- [ ] `deno test` nas edge functions tocadas continua verde (ou os testes novos
  cobrem a correção).
- [ ] `npm run build` continua verde.
- [ ] Push feito com as edge functions alteradas incluídas no diff — confirmar no
  separador *Actions* do GitHub que `Deploy Supabase Edge Functions` correu e
  terminou com sucesso. **Sem isto, P0-1 e P0-4 continuam ativos em produção
  mesmo com o código já corrigido no repositório.**

---

## Fase B — T0 (vocabulário e constantes) + guardas

- [x] `supabase/functions/_shared/formulas/vocabulary.ts` criado, com
  `normalizeGender`, tipos de nível de experiência, prioridade de prova,
  `categorizeDistance`, `MIN_PREP_WEEKS`, `MIN_VOLUME_KM`.
- [x] `vite.config.mjs`: `test.include` estendido para cobrir
  `supabase/functions/_shared/**/*.spec.{js,jsx,ts,tsx}` (só `.spec.` —
  `.test.ts` nesse caminho é reservado aos testes Deno-nativos, ver nota
  abaixo).
- [x] `vite.config.mjs`: alias `@formulas` → `supabase/functions/_shared/formulas`
  configurado e a funcionar (`import { normalizeGender } from '@formulas/vocabulary.ts'`
  compila e passa em teste — `src/utils/sharedVocabulary.test.js`).
- [x] Todos os consumidores de género (§Fase A P0-1 incluído) migrados para
  `normalizeGender()` em vez de comparação de string direta —
  `biEngine.js`, `coach-chat/index.ts` (3 sítios), `coach-daily-summary/index.ts`
  (via `isFemale()`, agora um wrapper fino sobre `normalizeGender`).
- [x] Tabelas `MIN_PREP_WEEKS`/`MIN_VOLUME_KM` movidas para T0, com as 3 cópias
  (`raceViability.js`, `coach-chat`, `coach-daily-summary`) substituídas por
  import — não cópia. `raceViability.js` reexporta para não quebrar
  `racePlanEngine.js`, que continua a importar dali.

**Nota de implementação — colisão Vitest/Deno em `_shared/formulas/`:**
o glob por omissão do `deno test` reconhece `*.test.ts` (a mesma convenção já
usada em `coach-daily-summary/index.test.ts`). Um ficheiro Vitest-only nesse
caminho com esse sufixo seria apanhado por `deno test` e partia a suite (importa
`vitest`, que o Deno não resolve). Por isso: testes Deno-nativos ficam
`*.test.ts` dentro de `_shared/formulas/`; testes Vitest-only do mesmo módulo
ficam em `src/utils/*.test.js` (importando via `@formulas`), nunca `.test.ts`
dentro de `_shared/`. `supabase/functions/deno.json` fixa
`test.include: ["**/*.test.ts"]` explicitamente, para não depender do
default do Deno variar por versão.

### Guardas de regressão (o projeto não tem linter — isto tem de ser teste)

- [x] Teste que falha se aparecer uma definição de função chamada `todayISO`
  fora de `src/lib/utils.js` — `src/utils/formulaGuards.test.js`. É uma
  ALLOWLIST, não proibição total: as ~10 cópias locais já existentes
  (`RunAgenda.jsx`, `Perfil.jsx`, etc.) ficam registadas explicitamente; o
  teste falha se aparecer uma cópia NOVA fora da lista, ou se remover uma
  entrada quando o ficheiro for migrado (Fase D).
- [x] Teste equivalente para `formatPace` e `formatDuration` — mesma allowlist,
  mesmo ficheiro.
- [x] Teste que falha se `biConstants.js` ganhar uma constante exportada sem
  nenhum import fora do próprio ficheiro — mesmo ficheiro, mesma allowlist
  (16 das 31 constantes atuais são código morto conhecido; o guard falha só
  para uma constante NOVA sem consumidor, fora da lista).
- [x] Processo documentado (não teste automático) para os literais de doutrina:
  qualquer PR que altere um número em `src/coach-knowledge/*.md` ou
  `specs/coach-investigacao.md` tem de listar, na descrição do PR, os
  ficheiros de código (`_shared/formulas/`, `src/utils/`, `supabase/functions/`)
  onde esse número está hardcoded, e confirmar que foram atualizados juntos.
  Decisão explícita (Fase B, specs/formulas-checklist.md): fica manual até
  haver massa crítica de constantes movidas para T0 com `@doutrina` a
  apontar para o bloco de origem (§3.5 de formulas-centralizacao.md) — nessa
  altura um teste programático pode comparar os dois lados automaticamente.

**Verificação de saída da Fase B:**
- [x] `npx vitest run` — inclui os testes-guarda novos, todos verdes (423/423
  nesta ronda).
- [ ] `deno test` nas edge functions que passaram a importar de `_shared/`
  (sem `deno` instalado neste ambiente de execução — a confirmar no
  primeiro `deno test` local ou no deploy).

---

## Fase C — T1 (fórmulas puras) e eliminação de cópias

Por cada fórmula movida, esta sub-checklist (repetir por linha do inventário em
`formulas-centralizacao.md` §4 marcada 🔴 ou 🟠):

- [x] Fórmula extraída para `supabase/functions/_shared/formulas/<nome>.ts`,
  pura (sem date-fns, sem I/O), com `@doutrina` a apontar para o bloco de
  origem. — feito para `acwr.ts`, `bodyComposition.ts`, `weightTrend.ts`,
  `taper.ts`, `energyAvailability.ts`.
- [x] Vetor dourado (`<nome>.golden.json`) escrito, cobrindo pelo menos: caso
  central, as duas fronteiras de cada zona/limiar, e um caso de dados em falta
  (`null`/`0`). — `acwr.golden.json`, `bodyComposition.golden.json`,
  `weightTrend.golden.json`, `taper.golden.json`, `energyAvailability.golden.json`.
- [x] Teste Vitest a percorrer o vetor dourado, verde — `acwr.spec.js`,
  `bodyComposition.spec.js`, `weightTrend.spec.js`, `taper.spec.js`,
  `energyAvailability.spec.js` (41 casos, todos verdes).
- [x] Teste Deno a percorrer o **mesmo** vetor dourado — escrito para as 5
  fórmulas; não corrido neste ambiente (sem `deno` instalado) — a confirmar
  no primeiro `deno test` local ou no deploy.
- [x] Todos os consumidores anteriores migrados para importar a fórmula —
  ACWR (`biEngine.js`, `coach-chat`, `coach-daily-summary`), gordura
  visceral (`biEngine.js`, `coach-chat`), tendência de peso (`biEngine.js`,
  `coach-chat`, `coach-daily-summary`), taper (`racePlanEngine.js`,
  `biEngine.js` insight de tapering, `coach-chat`, `coach-daily-summary`),
  EA (`biEngine.js` — único consumidor, sem cópias a eliminar).
- [x] Cópia antiga apagada — `VISCERAL_FAT_HEALTHY_MAX`/`VISCERAL_FAT_ALERT_MAX`
  removidas de `biConstants.js`; `ACWR_DANGER`/`ACWR_SAFE_MAX`/
  `ACWR_UNDER_TRAINING`/`EA_OPTIMAL`/`EA_CRITICAL` viram reexport dos
  módulos T1 em vez de definição local; `getTaperWeeks` (racePlanEngine.js)
  e os dois `getRacePhase`/limiar de tapering das Edge Functions e do
  `biEngine.js` deixaram de ter lógica própria.

**Decisões tomadas e implementadas nesta ronda (Fase C, 1.ª e 2.ª leva):**
- ACWR: grandeza única em **km** (não sRPE) — `biEngine.js` deixou de usar
  duração×RPE; `calculateACWR`/`calculateACWRHistory` migradas, janela 7d/28d
  igual às Edge Functions. Rótulos "(sRPE)"/"(baseado em km)" da Fase A
  (P0-3) removidos — já não há grandezas distintas para desambiguar.
- Taper: **tabela doutrina nível×distância×prioridade** (Bloco 2.3 #1),
  limite superior de cada gama (mais conservador). Substituiu 4
  implementações: `racePlanEngine.js` (`experienceLevel` recebido e nunca
  usado), `coach-chat`/`coach-daily-summary` (`daysUntil<=14` fixo,
  ignorava nível/distância/prioridade) e `biEngine.js` (limiares km 35/15
  que não batiam com `categorizeDistance`). Muda comportamento real: um
  iniciante numa maratona A-race passa a ter 2 semanas de taper (14 dias,
  doutrina 10-14) em vez de 3 fixas; médio/avançado numa 10k passam de 1
  para 2 semanas (doutrina 7-10 dias, antes só se olhava para o "7").
- Tendência de peso: **EWMA α≈0,25** (a já usada em `biEngine.js`) — migradas
  `coach-chat` (média simples 7d) e `coach-daily-summary` (regressão 2
  pontos).
- EA: **implementada** — `energyAvailability.ts` extrai a fórmula pura
  (única implementação no projeto, sem cópias a eliminar) com a limitação
  de doutrina mantida como comentário permanente no código-fonte (não só
  aqui): `lean_body_mass_kg` continua a vir de BIA, que a doutrina
  (`04-nutricao-seguranca.md:40`) já desaconselha como denominador de
  precisão — "o numerador é bom, o denominador é fraco" — e o próprio
  documento diz que o EA isolado "não deve gerar um alarme automático
  sozinho". Nenhuma fonte melhor de massa magra está implementada na app
  hoje; fica registada como melhoria de doutrina pendente, não como bug.
- Gordura visceral (não era uma das 4 perguntas, mas P0 do inventário):
  corrigida de raiz — `biEngine.js` só verificava `>= 14`, saltando a faixa
  de alerta 10-13.

### Necessidade de fontes/investigação adicional — avaliação desta leva

Pedido do utilizador: identificar, por fórmula tocada, se é preciso ir
buscar mais informação a fontes fidedignas antes de fechar.

- **Taper (Bloco 2.3 #1)**: **não é preciso** — doutrina com confiança ALTA,
  3 fontes concordantes (Mujika & Padilla 2003, Pfitzinger 2019, Daniels
  2021), sem conflito assinalado no documento-fonte. A única escolha de
  implementação (limite superior da gama, não inferior/médio) é minha, não
  uma lacuna de fonte — documentada no código, reversível se preferires
  outro critério.
- **EA / RED-S (Bloco 4.2 #1)**: **não é preciso** — a limitação já está
  identificada e documentada na própria doutrina (IOC Consensus 2018/2023,
  Loucks 2004, ACSM 2016, confiança ALTA); o problema é de disponibilidade
  de dados na app (só BIA para massa magra), não de literatura por
  consultar.
- **Achado por leitura, fora do que foi pedido nesta ronda**: Bloco 2.3 #2
  (dias de recuperação pós-esforço máximo, ficheiro
  `src/coach-knowledge/02-corrida-prova.md`) tem um **conflito de fontes
  não resolvido**, já assinalado no próprio documento — avançado+maratona:
  10-14 dias (Pfitzinger/Canova) vs. 26 dias, regra "1 dia por milha em
  esforço máximo" (Daniels/Galloway). O documento propõe adotar 26 dias
  (mais conservador) "mas fica por confirmar contigo antes de ir para
  doutrina" — nunca chegou a ser confirmado. Não é bloqueador desta ronda
  (recuperação pós-prova não estava nas 4 decisões pedidas), mas é uma
  decisão tua pendente, não uma correção de código.
- Avaliação completa (todas as fórmulas ainda por migrar) fica para o fecho
  da Fase C — ver checklist "Ainda por fazer" abaixo.

### Ainda por fazer nesta fase (T1 restantes)

Da tabela de inventário (`formulas-centralizacao.md` §4), por ordem de risco:

- [ ] VDOT (Daniels-Gilbert), Riegel, equivalente ITRA — já são sítio único
  no frontend (`biEngine.js`/`racePlanEngine.js`); só falta mudar de casa
  para `_shared/formulas/` com vetor dourado, sem mudança de comportamento.
- [ ] Mifflin-St Jeor/TDEE — P0-4 continua deliberadamente por resolver
  (decisão do utilizador, Fase A).
- [ ] Tanaka/Karvonen, Epley (1RM) — sítio único, só mudar de casa.
- [ ] `sessionVolumeKg` — já existe e é usada dentro de `biEngine.js`, mas
  `GymDashboard.jsx`/`GymSessionCard.jsx` continuam a reimplementá-la.
- [ ] Sapatilhas (desgaste) — 3 implementações, uma delas sem os limiares de
  aviso.
- [ ] Limiar de perda de peso rápida — 3 valores incoerentes (0,7%/sem ·
  0,9 kg/sem · 1,5%/72h) nas 3 runtimes; distinto da tendência de peso
  (esse já resolvido nesta ronda).
- [ ] Compliance nutricional — 3 escalas diferentes (85/115 · 90/70/115 ·
  75/90/110).
- [ ] Recuperação pós-prova — não fazia parte das 4 decisões desta ronda;
  tem uma decisão pendente do utilizador (ver "Necessidade de fontes"
  acima), não só uma migração de casa.

### Paridade frontend↔backend a confirmar nesta fase

Lista dos valores que, depois da migração, têm de bater byte-a-byte nas duas
runtimes para o mesmo input — cada linha vira um caso no vetor dourado:

- [x] ACWR: mesmo ratio e mesma zona para o mesmo histórico de corridas —
  golden vector comum, 9 casos.
- [x] `categorizeDistance`: mesma categoria nas fronteiras exatas (5.5, 11.0,
  22.5, 50.0 km) — Fase B, `vocabulary.ts`.
- [x] Taper: mesmas semanas para a mesma combinação nível×distância×prioridade
  — golden vector comum, 14 casos.
- [ ] Mifflin-St Jeor/GETD: mesmo TMB e mesmo GETD para o mesmo perfil —
  pendente (P0-4 continua em aberto).
- [ ] Riegel: mesma previsão de tempo/pace, incluindo o caso trail (equivalente
  ITRA) — este é o bug original desta sessão; não regredir. Ainda não
  migrado para `_shared/formulas/`.
- [x] Gordura visceral: mesmos 3 escalões (1-9/10-14/≥15) nos dois lados —
  golden vector comum, 7 casos.
- [x] EA: mesma classificação (ótima/subclínica/crítica) para o mesmo
  intake/exercise/leanMass — golden vector comum, 7 casos.

**Verificação de saída da Fase C (parcial — 5 de ~9 fórmulas T1 migradas):**
- [x] `npx vitest run` verde — 471/471 (41 testes novos desde o início da
  Fase C: 5 vetores dourados + migração de fixtures existentes).
- [ ] `deno test` (toda a suite de edge functions) verde — não corrido
  (sem `deno` neste ambiente); sintaxe verificada com `esbuild` em todos os
  `.ts` novos/alterados.
- [x] `npm run build` verde.
- [x] Grep de confirmação: ACWR, gordura visceral, tendência de peso, taper
  e EA não têm segunda definição fora de `_shared/formulas/`.

---

## Fase D — Higiene de `src/components/`

Menor risco, pode correr em paralelo com C. Por cada componente na lista de
"cópias locais" do relatório de auditoria (`todayISO`, `formatPace`,
`formatDuration`, `BODY_METRICS`, arrays de meses PT, etc.):

- [ ] Import local removido, substituído por import do util canónico.
- [ ] Nenhuma mudança de comportamento visível não intencional (ex.: migrar
  `RunCard.jsx` de `"5'20\"/km"` para `"5.20"` é uma mudança de UI real —
  confirmar com quem pediu antes de aplicar em componentes visíveis ao
  utilizador, não só nos internos).
- [ ] `npx vitest run` verde a cada lote de componentes migrados.

---

## Checklist de release (todas as fases)

- [ ] `npx vitest run` — suite completa verde (415 testes é a baseline
  registada no início desta auditoria; deve só crescer).
- [ ] `deno test` — suite completa das edge functions verde.
- [ ] `npm run build` verde, sem novos avisos de import não resolvido.
- [ ] Diff revisto para confirmar que nenhuma fórmula foi "corrigida" em dois
  sítios com valores diferentes por engano (o erro exato desta auditoria).
- [ ] Se o diff toca `supabase/functions/**`: confirmar no GitHub Actions que
  `Deploy Supabase Edge Functions` disparou e terminou com sucesso, nos dois
  ramos (`dev` e `master`, conforme o workflow).
- [ ] Se o diff toca doutrina (`src/coach-knowledge/` ou `specs/`): confirmar
  que os números novos foram propagados às constantes/fórmulas correspondentes,
  não só ao texto.
