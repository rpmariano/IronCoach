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

- [x] **P0-4 — TDEE: dois fatores de atividade. RESOLVIDO.**
  `coach-chat/index.ts:1908` usava `TMB × 1.3 + custo_corrida`;
  `coach-daily-summary/index.ts:449` usava `TMB × 1.55`, sem custo de corrida.
  - Decisão do utilizador: fator único ×1,3 (o que o coach-chat já usava,
    dentro da gama 1,2-1,4 da doutrina) + custo do treino somado à parte.
  - `@formulas/tdee.ts` (T1) criado com `computeBMR`/`computeTDEE`; as duas
    edge functions passam a delegar nele. `coach-daily-summary` ganhou um
    2.º argumento (`weeklyVolumeKm`, derivado de `acwr.acute_km_per_day×7`)
    para poder somar o custo do treino, que antes ignorava por completo.
  - Critério de aceitação: as duas edge functions dão o mesmo valor (±1 kcal
    de arredondamento) para o mesmo perfil e mesmo volume semanal —
    confirmado por vetor dourado comum (`tdee.golden.json`, 7 casos).

- [ ] **P0-5 — `todayISO` em UTC no pilar Tático.**
  `src/utils/biEngine.js:1141`, dentro de `calculateReadinessIndex`, usa
  `new Date().toISOString().slice(0, 10)` em vez do `todayISO()` local de
  `src/lib/utils.js:3`.
  - Teste: simular `Date.now()` entre 00:00–01:00 (hora de Lisboa, horário de
    verão) e confirmar que este `todayISO` difere do de `lib/utils.js` nesse
    intervalo.
  - Critério de aceitação: `calculateReadinessIndex` importa e usa
    `todayISO()` de `lib/utils.js`, sem redefinição local.

- [x] **P0-6 — Nutrientes sem fallback em `calculateMacroAdherence`/`calculateEnergyAvailability`. RESOLVIDO** (confirmado durante a Fase E — a caixa não tinha sido atualizada; o código já usava `mealNutrients()`).
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
  `taper.ts`, `energyAvailability.ts`, `racePrediction.ts`, `shoes.ts`,
  `weightLossRate.ts`.
- [x] Vetor dourado (`<nome>.golden.json`) escrito, cobrindo pelo menos: caso
  central, as duas fronteiras de cada zona/limiar, e um caso de dados em falta
  (`null`/`0`). — um `.golden.json` por módulo acima, 8 no total.
- [x] Teste Vitest a percorrer o vetor dourado, verde — um `.spec.js` por
  módulo acima (69 casos, todos verdes).
- [x] Teste Deno a percorrer o **mesmo** vetor dourado — escrito para as 8
  fórmulas; não corrido neste ambiente (sem `deno` instalado) — a confirmar
  no primeiro `deno test` local ou no deploy.
- [x] Todos os consumidores anteriores migrados para importar a fórmula —
  ACWR (`biEngine.js`, `coach-chat`, `coach-daily-summary`), gordura
  visceral (`biEngine.js`, `coach-chat`), tendência de peso (`biEngine.js`,
  `coach-chat`, `coach-daily-summary`), taper (`racePlanEngine.js`,
  `biEngine.js` insight de tapering, `coach-chat`, `coach-daily-summary`),
  EA (`biEngine.js` — único consumidor, sem cópias a eliminar), VDOT/Riegel/
  ITRA (`biEngine.js`, `racePlanEngine.js`), sapatilhas (`shoes.js`,
  `coach-chat`, `estimate-shoe-lifespan`), sessionVolumeKg (`GymDashboard.jsx`,
  `GymSessionCard.jsx`), limiar de perda de peso (`biEngine.js`,
  `coach-daily-summary`).
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

- [x] VDOT (Daniels-Gilbert), Riegel, equivalente ITRA — migrados para
  `racePrediction.ts`, sem mudança de comportamento (vetor dourado
  confirma os mesmos valores de antes da migração).
- [x] Mifflin-St Jeor/TDEE — P0-4 **resolvido**: fator único ×1,3 + custo do
  treino, `@formulas/tdee.ts`, migradas as duas edge functions.
- [x] Tanaka/Karvonen, Epley (1RM) — migrados para `heartRateZones.ts` e
  `epley.ts` respetivamente. Eram sítio único, sem cópias a eliminar — a
  migração é higiene arquitetural (consistência com o resto de
  `_shared/formulas/`), não correção de bug.
- [x] `sessionVolumeKg` — `GymDashboard.jsx`/`GymSessionCard.jsx` deixaram
  de reimplementar a soma peso×reps e passaram a importar de `biEngine.js`
  (fica no frontend — não há cópia nas Edge Functions para justificar T1).
- [x] Sapatilhas (desgaste) — migradas para `shoes.ts`; corrige o
  `coach-chat`, que reimplementava o fator de peso mas sem o limiar
  "atenção" a 75% (só tinha a regra fixa de "trocar" a 90%).
- [x] Limiar de perda de peso rápida — `weightLossRate.ts`, doutrina com
  confiança ALTA e convergência tripla independente (Bloco 1 #6, 4.1 #5,
  4.2 #3). Corrige `coach-daily-summary`, que usava um limiar absoluto
  fixo (0,9 kg/semana para toda a gente) em vez de %/semana por nível. O
  "1,5%/72h" do `coach-chat` **não é cópia deste** — é um sinal agudo
  distinto (Bloco 5 #11, queda súbita por desidratação/doença), deixado
  intacto.
- [x] Compliance nutricional — **resolvido**: era uma decisão de UX/produto
  sem doutrina a consultar (3 escalas: `NutritionDashboard.jsx` 85/115,
  `OverviewDashboard.jsx` 90/70/115, `biEngine.js` 75/90/110). Decisão do
  utilizador: escala do `OverviewDashboard` (mais granular, 4 zonas) em
  todo o lado — `@formulas/nutritionCompliance.ts` (T1), migrados os 3
  consumidores. A pontuação do Pilar de Prontidão (100/65/20) mantém-se
  como composição própria do pilar; só a fronteira das zonas ficou única.
- [x] Recuperação pós-prova — **resolvido**. `getRecoveryDaysAfterRace`
  só distinguia "avançado" de "toda a gente" (2 grupos); a doutrina tem 4
  níveis com valores bem diferentes entre si — a simplificação dava dias
  a menos para iniciante/básico e a mais para médio, em quase todas as
  distâncias. Migrada para `recovery.ts` com a tabela completa (limite
  superior de cada gama, mesma convenção do taper). Conflito
  avançado+maratona (10-14 dias Pfitzinger/Canova vs. 26 dias Daniels/
  Galloway): decisão do utilizador — 26 dias, o mais conservador, a mesma
  regra que o documento de investigação já propunha.

### Paridade frontend↔backend a confirmar nesta fase

Lista dos valores que, depois da migração, têm de bater byte-a-byte nas duas
runtimes para o mesmo input — cada linha vira um caso no vetor dourado:

- [x] ACWR: mesmo ratio e mesma zona para o mesmo histórico de corridas —
  golden vector comum, 9 casos.
- [x] `categorizeDistance`: mesma categoria nas fronteiras exatas (5.5, 11.0,
  22.5, 50.0 km) — Fase B, `vocabulary.ts`.
- [x] Taper: mesmas semanas para a mesma combinação nível×distância×prioridade
  — golden vector comum, 14 casos.
- [x] Mifflin-St Jeor/GETD: mesmo TMB e mesmo GETD para o mesmo perfil —
  golden vector comum (`tdee.golden.json`, 7 casos).
- [x] Riegel: mesma previsão de tempo/pace — golden vector comum, migrado
  para `racePrediction.ts`. O caso trail (equivalente ITRA) está coberto
  pelo mesmo módulo (`calculateEquivalentFlatKm`, 3 casos no vetor).
- [x] Gordura visceral: mesmos 3 escalões (1-9/10-14/≥15) nos dois lados —
  golden vector comum, 7 casos.
- [x] EA: mesma classificação (ótima/subclínica/crítica) para o mesmo
  intake/exercise/leanMass — golden vector comum, 7 casos.
- [x] Sapatilhas: mesmo fator de peso e o mesmo nível de desgaste
  (ok/atenção/substituir/excedida) nos dois lados — golden vector comum,
  10 casos.
- [x] Limiar de perda de peso: mesma classificação (%/semana × limiar do
  nível) nos dois lados — golden vector comum, 7 casos.
- [x] TDEE: mesmo TMB e mesmo GETD (fator ×1,3 + custo do treino) nas duas
  edge functions — golden vector comum, 7 casos.
- [x] Compliance calórica: mesma zona (crítico/baixo/ok/acima) nos 3 ecrãs
  — golden vector comum, 10 casos.
- [x] Recuperação pós-prova: mesmos dias para a mesma combinação
  nível×distância — golden vector comum, 15 casos.
- [x] Tanaka/Karvonen: mesma FCmáx e as mesmas 5 zonas para a mesma
  idade/FC repouso — golden vector comum.
- [x] Epley: mesmo 1RM estimado para o mesmo peso×reps — golden vector
  comum.

**Verificação de saída da Fase C — completa. Todas as fórmulas do
inventário (`formulas-centralizacao.md` §4) estão em `_shared/formulas/`:**
- [x] `npx vitest run` verde — 539/539 (116 testes novos desde o início da
  Fase C: 13 vetores dourados + migração de fixtures existentes).
- [ ] `deno test` (toda a suite de edge functions) verde — não corrido
  (sem `deno` neste ambiente); sintaxe verificada com `esbuild` em todos os
  `.ts` novos/alterados.
- [x] `npm run build` verde.
- [x] Grep de confirmação: nenhuma das 13 fórmulas migradas tem segunda
  definição fora de `_shared/formulas/`.

### Necessidade de fontes/investigação adicional — avaliação final da Fase C

Pedido do utilizador (repetido no fecho desta leva): confirmar se falta
investigação em fontes fidedignas antes de dar a fase por concluída.

- **Limiar de perda de peso rápida**: **não é preciso** — confiança ALTA,
  convergência tripla independente já documentada na doutrina (não é
  achado desta sessão, já estava lá).
- **VDOT/Riegel/ITRA, sapatilhas, `sessionVolumeKg`**: **não aplicável** —
  não são afirmações de doutrina científica, são fórmulas
  matemáticas/físicas estabelecidas (Daniels-Gilbert 1979, Riegel,
  Naismith) ou lógica de agregação de dados. Não há "fonte" nova a
  consultar, só correção de implementação.
- **Compliance nutricional**: como o taper/EA, **não precisava de mais
  fontes** — pela razão oposta: não há doutrina nenhuma a cobrir isto (é
  UX, não fisiologia). Não havia pesquisa que produzisse uma resposta
  "certa" — foi decisão de produto do utilizador (escala do
  `OverviewDashboard`, 70/90/115). **Resolvido nesta ronda.**
- **TDEE (P0-4)**: era o único item desta fase com um conflito real de
  fontes por resolver (coach-chat ×1,3+custo vs. coach-daily-summary
  ×1,55) — decisão do utilizador: ×1,3 + custo do treino (o valor que já
  batia com a doutrina, 1,2-1,4 + custo à parte). **Resolvido nesta
  ronda.**
- **Tanaka/Karvonen, Epley**: **não aplicável** — mesma razão do
  VDOT/Riegel acima, são fórmulas estabelecidas (Tanaka 2001, Epley 1985),
  não afirmações de doutrina por verificar.
- **Recuperação pós-prova**: tinha um conflito real de fontes na doutrina
  (Pfitzinger/Canova 10-14 dias vs. Daniels/Galloway 26 dias, só para
  avançado+maratona) — decisão do utilizador: 26 dias, o mais
  conservador. **Resolvido nesta ronda.**

Com isto, a Fase C fica completa — todas as fórmulas do inventário
(`formulas-centralizacao.md` §4) vivem em `_shared/formulas/`, sem
nenhuma decisão por tomar.

---

## Fase D — Higiene de `src/components/`

Menor risco, pode correr em paralelo com C. Por cada componente na lista de
"cópias locais" do relatório de auditoria (`todayISO`, `formatPace`,
`formatDuration`, `BODY_METRICS`, arrays de meses PT, etc.):

- [x] Import local removido, substituído por import do util canónico —
  `todayISO` (9 componentes → `lib/utils.js`; `NutritionOptionA.jsx` foi à
  parte, para `lisbonTodayISO()`, por já forçar Europe/Lisbon — ver nota
  abaixo), `formatDuration` (`RunCard.jsx`, `GymSessionCard.jsx` → `run.js`,
  cópias byte-idênticas), `formatPace` (`RunDashboard.jsx`, `RunCard.jsx`,
  `ScatterTrendChart.jsx` → `run.js`).
- [x] Nenhuma mudança de comportamento visível não intencional — `todayISO`
  e `formatDuration` foram migrações "de casa" puras (mesmo resultado,
  confirmado ficheiro a ficheiro). `formatPace` **teve** mudança de UI real
  (3 formatos diferentes — `"5:20/km"`, `"5'20\"/km"`, `"5:20"` — passam
  todos a `"5.20"` + sufixo onde já existia): perguntei antes de aplicar,
  como o checklist pedia, e o utilizador confirmou a unificação.
- [x] `npx vitest run` verde a cada lote de componentes migrados — 499/499
  no lote final.

**Nota — `NutritionOptionA.jsx`:** o único dos 10 `todayISO` locais que não
media "hoje" da mesma forma que o canónico. A cópia local já forçava
Europe/Lisbon (não o fuso do dispositivo); migrar para `todayISO()`
(hoje local do browser) teria sido uma mudança de comportamento real para
quem usa a app fora de Portugal. Foi para `lisbonTodayISO()` (já existia em
`lib/utils.js`, usada nos lembretes) — mesmo resultado, zero cópia.

**Verificação de saída da Fase D:**
- [x] `npx vitest run` verde — 499/499.
- [x] `npm run build` verde.
- [x] Grep de confirmação: nenhuma definição local de `todayISO`,
  `formatPace` ou `formatDuration` fora dos ficheiros canónicos
  (`lib/utils.js`, `utils/run.js`).
- [x] Guardas de regressão (`formulaGuards.test.js`) atualizadas — as 3
  allowlists ficaram vazias (só o ficheiro canónico); qualquer cópia nova
  de qualquer um dos três volta a falhar a suite.

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

---

## Fase Carol — fiabilidade e omnisciência do chat

Motivada por um bug real (2026-08-25): o atleta perguntou "quantos km fiz de
corrida a semana passada" e a Carol respondeu "zero", apesar de 65 km em 3
corridas em 2026-08-21 estarem na base de dados; quando confrontada,
inventou uma justificação em vez de recalcular. Diagnóstico: não era falta
de dados (o ACWR, janela ROLANTE, já continha o número certo) — era (a) a
instrução do prompt a proibir chamadas de ferramenta dentro da janela de 30
dias, (b) ausência de um agregado em formato de SEMANA DE CALENDÁRIO
(a pergunta do atleta), e (c) nenhuma regra a impedir a Carol de inventar
uma explicação em vez de recalcular.

- [x] `_shared/formulas/weeklyVolume.ts` (T1) — `computeCalendarWeeklyVolume`,
  agrega corridas em semana atual/semana passada (segunda-domingo),
  distinto do ACWR (janela rolante). Golden vector + `weeklyVolume.spec.js`
  + `weeklyVolume.test.ts`.
- [x] `coach-chat/index.ts`: novo bloco "VOLUME SEMANAL (calendário)" no
  prompt, ao lado do ACWR, com datas explícitas e nota a distingui-lo do
  ACWR.
- [x] Lista bruta de corridas (`buildRunningSummary`) marcada
  "DETALHE, NÃO SOMES" — aponta para o bloco de totais.
- [x] Gate de function-calling reescrito: já não proíbe chamar
  `get_running_history`/`get_nutrition_history`/`get_gym_history` dentro das
  janelas pré-carregadas — só evita chamadas desnecessárias quando já existe
  um total pré-calculado.
- [x] Regra explícita anti-alucinação junto ao gate: nunca responder com um
  número que não veio do contexto, de uma soma simples verificável, ou de
  uma chamada de função; nunca inventar uma justificação para uma resposta.
- [x] Insights ativos (`activeInsights`) — confirmado que já iam para o
  prompt com estado de resolução (`Coach.jsx` → `coach-chat/index.ts:~3412`);
  não foi preciso alterar.
- [x] `npx vitest run` verde — 544/544 (539 + 5 novos).
- [x] `npm run build` verde.

### E0 — Queries partidas (a verdadeira causa do bug do "zero km")

Ao arrancar a Fase E, a verificação do esquema real contra a base de dados
(via MCP Supabase) revelou que **seis `select` pediam colunas que não
existem**. O PostgREST devolve 400, mas o handler só desestruturava `data` e
fazia `|| []` — o erro desaparecia sem rasto.

| Ficheiro | Query | Coluna pedida | Coluna real |
|---|---|---|---|
| `coach-chat` | `runs` (contexto 30d) | `cadence_spm`, `avg_heart_rate_bpm` | dentro de `details` (jsonb) |
| `coach-chat` | `runs` (ferramenta `get_running_history`) | idem | idem |
| `coach-chat` | `body_assessments` | `assessed_at` | `date` |
| `coach-daily-summary` | `runs` | `avg_heart_rate_bpm`, `cadence_spm` | dentro de `details` |
| `coach-daily-summary` | `workout_sessions` | `avg_heart_rate_bpm` | `avg_hr` |
| `coach-daily-summary` | `race_events` | `target_pace` | `target_pace_seconds_per_km` |

Consequência real, confirmada com os dados do atleta (25+20+20 km a
2026-08-21 existem na tabela): a Carol recebia **zero corridas** e **zero
avaliações corporais**. Quando respondeu "zero km a semana passada" estava a
relatar fielmente um contexto vazio — não era alucinação de soma. O resumo
diário perdia corridas, ginásio e provas pela mesma razão.

- [x] As seis queries corrigidas (`runs` passa a trazer `details` e
  `effort_rpe`; `body_assessments` usa alias `assessed_at:date` para não
  quebrar o contrato de `computeBodyMetrics`).
- [x] `summariseRuns` passa a ler cadência/FC de `details`; o helper de teste
  correspondente deixou de alimentar uma forma impossível.
- [x] `warnIfQueryFailed` — os erros das 8 queries de contexto passam a ir
  para os logs em vez de desaparecerem. É a guarda contra a classe de bug.
- [x] `npx vitest run` verde (544/544); `npm run build` verde; as seis formas
  de query validadas contra a base de dados real.

**Nota sobre a fase anterior:** o bloco "VOLUME SEMANAL (calendário)", a marca
"DETALHE, NÃO SOMES" e as regras anti-alucinação continuam corretos e úteis,
mas **não podiam ter corrigido este bug** — operavam sobre uma lista vazia. O
diagnóstico de ontem estava incompleto.

---

### E1 — Agregações de corrida

Quatro módulos T1.5 novos, o padrão de `weeklyVolume.ts` estendido a
indicadores que antes só existiam no ecrã:

- [x] `trainingDistribution.ts` — polarização 80/20 (Seiler), alvo por nível.
  Corrige em definitivo o P0-8 original: só há um sítio a decidir o alvo por
  nível agora; `RunDashboard.jsx` já não pode voltar a chamar sem o 2.º
  argumento porque deixou de existir uma versão sem ele.
- [x] `vdotTrend.ts` — seleção de "time trial" + série de VDOT (usa
  `calculateVDOT` de `racePrediction.ts`, já partilhado desde a Fase C).
- [x] `bestPace.ts` — recordes por escalão 5/10/21 km, split-first. O
  fallback `r.pace` (string) do original em `RunDashboard.jsx` não foi
  portado — confirmado por leitura do schema (`select('*')` em `runs`) que
  essa coluna nunca existiu; era código morto.
- [x] `runWatchMetrics.ts` — desnível/calorias/cadência média. **Bug de
  paridade encontrado ao migrar**: o original em `RunDashboard.jsx` lia
  `r.elevation_gain_m`/`r.calories_kcal`/`r.avg_cadence_spm` como colunas de
  TOPO; a tabela real só tem `details` (jsonb), e a chave certa é
  `cadence_spm` (não `avg_cadence_spm`, que nunca existiu). O cartão "Watch
  metrics" do RunDashboard mostrava sempre 0 km / 0 kcal / cadência "—",
  mesmo com dados gravados. Corrigido ao migrar — mesma classe de bug do
  E0, desta vez no frontend.
- [x] `biEngine.js` (`calculateTrainingDistribution`, `getVDOTTrend`) e
  `RunDashboard.jsx` (`getBestPaceData`, `watchMetrics`) migrados para
  importar os módulos partilhados; implementações locais eliminadas.
- [x] `biConstants.js`: `TARGET_LOW_INTENSITY_PCT` removida (duplicava
  `trainingDistribution.ts` depois da migração); `TARGET_HIGH_INTENSITY_PCT`
  fica — já era código morto antes desta fase, sem relação com o E1.
- [x] `coach-chat/index.ts`: novo bloco **"PAINEL DE CORRIDA"** no prompt —
  polarização 80/20, VDOT atual + tendência, melhores paces 5/10/21k
  (rotulado "não é recorde histórico" porque usa a janela de 30 dias, não
  all-time como a UI), e desnível/calorias/cadência. Regra de ouro do gate
  estendida para o citar como fonte pré-calculada.
- [x] `npx vitest run` verde — 559/559 (544 + 15 novos). `npm run build`
  verde. Saída dos 4 módulos verificada manualmente com dados realistas
  (script descartável, não commitado).

**Decisão do utilizador (2026-08-25): `oneRepMax.ts` retirado do âmbito.**
A app deixou de ter registo de exercícios específicos, só categorias/grupos
musculares — `calculate1RMProgression` (`biEngine.js`) já não tem consumidor
em `src/components/`. `epley.ts` fica no repositório mas não ganha módulo de
agregação nem linha no painel. Limpeza futura (fora desta fase): remover
`calculate1RMProgression` quando se mexer em `biEngine.js` por outro motivo.

---

### E2 — Agregações de ginásio

Cinco módulos T1.5 novos:

- [x] `sessionVolumeKg.ts` — Σ peso×reps de uma sessão (fórmula de base para
  os outros três).
- [x] `relativeDateRange.ts` — filtro "período relativo" (dia/semana/mês/
  trimestre/6meses/ano) usado pelos seletores de intervalo dos dashboards.
  Extraído de `filterByDateRange` (impuro, `new Date()` + date-fns) para uma
  versão pura com `todayISO` explícito e cálculo de mês/ano em UTC — clamp de
  fim de mês replicado manualmente (31 Jan − 1 mês = 31 Dez; 31 Mar − 1 mês
  = 28/29 Fev, testado nos dois casos) para não mudar o que os dashboards
  mostram. Simplifica a granularidade de hora do original (que dependia da
  hora exata do render) para granularidade de dia — inofensivo porque todas
  as tabelas consumidas guardam `date`, não timestamp; documentado no módulo.
- [x] `volumeLoad.ts` — volume-carga total, quebra semanal e ACWR de
  ginásio. **Bug de porte apanhado antes de commitar** (não chegou a ir para
  produção): a primeira versão tinha a semântica de `acwrHasEnoughData`
  invertida — o original verifica se existe HISTÓRICO ANTERIOR à janela
  aguda (`!isAfter(d, acuteDate)`, ou seja "alguma sessão com 7+ dias"), não
  se há sessões agudas; corrigido e coberto por um caso de vetor dourado
  dedicado (sessão única e recente → `acwrHasEnoughData: false` apesar de o
  rácio ser calculável).
- [x] `muscleGroupVolume.ts` — séries e volume por grupo muscular.
- [x] `classAnalytics.ts` — contagem/tempo/RPE médio por aula, no geral e
  por modalidade. `avgRpe` mantido como STRING (`toFixed(1)`) para não
  mudar o que já está no ecrã — o original já formatava assim antes de
  guardar no estado.
- [x] `biEngine.js` (`sessionVolumeKg`, `calculateVolumeLoad`,
  `calculateMuscleGroupVolume`) e `GymDashboard.jsx` (`classAnalytics`)
  migrados para importar os módulos partilhados; implementações locais
  eliminadas. `calculateVolumeLoad`/`calculateMuscleGroupVolume` passam a
  receber `todayISO()` (fuso local, já existia no import de `lib/utils.js`)
  em vez do `new Date()` impuro.
- [x] `coach-chat/index.ts`: novo bloco **"PAINEL DE GINÁSIO"** no prompt —
  volume-carga + ACWR de ginásio, top-5 grupos musculares, top-3 aulas com
  RPE médio. Usa os `workout_sessions` de 30 dias já carregados (sem query
  nova) com um range sentinela ("todos", fora das 6 chaves reconhecidas)
  para não voltar a filtrar um array que a query já limitou por data — evitar
  um corte adicional nos meses de 31 dias. Regra de ouro do gate estendida.
- [x] `npx vitest run` verde — 585/585 (559 + 26 novos). `npm run build`
  verde. Saída dos 3 módulos verificada manualmente com dados realistas.

**Decisão do utilizador (2026-08-25): `oneRepMax.ts` retirado do âmbito.**
A app deixou de ter registo de exercícios específicos, só categorias/grupos
musculares — `calculate1RMProgression` (`biEngine.js`) já não tem consumidor
em `src/components/`. `epley.ts` fica no repositório mas não ganha módulo de
agregação nem linha no painel. Limpeza futura (fora desta fase): remover
`calculate1RMProgression` quando se mexer em `biEngine.js` por outro motivo.

**Duplicação relacionada identificada, fora do âmbito desta fase:**
`summariseSessions` (`coach-chat/index.ts:684`) reimplementa a mesma soma
peso×reps de `sessionVolumeKg`, só que por linha bruta em vez de delegar —
os totais batem por coincidência (ambos tratam série incompleta como 0), mas
é a mesma classe de duplicação que a Fase E veio eliminar. Não migrado agora
porque o objetivo de `summariseSessions` é montar a listagem linha-a-linha
para o prompt (Bloco 3 #10, contagem de séries ≥15 reps), não um agregado —
mudar isso é um passo maior do que esta fase pedia. Fica anotado para uma
futura limpeza.

---

### E3 — Agregações de nutrição e corpo

Cinco módulos T1.5 novos:

- [x] `mealNutrients.ts` — nutrientes de um item/refeição com o fallback de
  3 níveis (P0-6 original). **Bug real corrigido durante a migração,
  confirmado com o utilizador antes de aplicar** (mudança visível no
  ecrã): `itemNutrients`/`mealNutrients` (`nutrition.js`) nunca calculavam
  ferro/cálcio/vitamina C/potássio — só `calories/protein/carbs/fat/fiber/
  sugar/sodium` — apesar de `rangeTotals` já tentar somar
  `n.iron_mg`/`n.calcium_mg`/`n.vitamin_c_mg`/`n.potassium_mg` do resultado
  (sempre `undefined`, mascarado por `|| 0`). Os totais destes 4
  micronutrientes no `NutritionDashboard` mostravam sempre 0, apesar de as
  colunas `meal_items.iron_mg_per_100g` etc. existirem e serem gravadas.
  Corrigido, com o mesmo padrão de fallback dos outros micronutrientes.
- [x] `macroAdherence.ts` — cumprimento % por macro sobre uma janela
  (usa `mealNutrients.ts` + `relativeDateRange.ts`).
- [x] `energyAvailabilityWindow.ts` — EA diária/média/`isAtRisk`/
  `daysAtRisk` (usa `mealNutrients.ts` + `energyAvailability.ts`, já
  partilhado desde a Fase C, + `relativeDateRange.ts`). `RUNNING_COST_KCAL_PER_KG_KM`
  extraída de `tdee.ts` como constante exportada (antes só inline), para
  as duas fórmulas partilharem o número em vez de cada uma hardcodar o seu
  próprio "1.0".
- [x] `compositionTrend.ts` — massa gorda vs. massa magra ao longo do
  tempo. Já era puro no original — só mudou de casa.
- [x] `micronutrientTotals.ts` — totais de macros+micros sobre um período
  de CALENDÁRIO ("hoje"/"esta semana desde segunda"/"este mês desde dia 1")
  — **vocabulário de período genuinamente diferente** do `relativeDateRange.ts`
  (janela rolante de N dias), documentado no módulo para não serem
  confundidos ou unificados por engano.
- [x] `biEngine.js` (`calculateMacroAdherence`, `calculateEnergyAvailability`,
  `calculateCompositionTrend`) e `nutrition.js` (`itemNutrients`,
  `mealNutrients`, `rangeTotals`) migrados para importar os módulos
  partilhados; implementações locais eliminadas. `rangeBounds()` (nutrition.js)
  removida — ficou sem consumidor fora de `rangeTotals`; o import de
  `date-fns` nesse ficheiro foi com ela.
- [x] `biConstants.js`: `EA_CRITICAL_DURATION_DAYS` e
  `RUNNING_COST_KCAL_PER_KG_KM` removidas (duplicavam as versões agora em
  `energyAvailabilityWindow.ts`/`tdee.ts`).
- [x] `coach-chat/index.ts`: `weekMeals` (7 dias) alargado para trazer as
  colunas `*_per_100g` de fibra/açúcar/sódio/ferro/cálcio/vit.C/potássio
  (antes só calorias/proteína/hidratos/gordura) — sem isto os novos módulos
  ficariam sem dados para os micronutrientes. Mesmo alargamento aplicado à
  ferramenta `get_running_history`/`get_nutrition_history` por consistência
  (usa `aggregateMealsByDate`, que ignora as colunas que não lê — inofensivo).
  Novo bloco **"PAINEL DE NUTRIÇÃO/CORPO"** no prompt — cumprimento
  calórico/macros, Disponibilidade Energética com aviso de RED-S,
  composição corporal mais recente, micronutrientes de hoje. Regra de ouro
  do gate estendida.
- [x] `npx vitest run` verde — 605/605 (585 + 20 novos). `npm run build`
  verde. Saída dos módulos verificada manualmente com dados realistas.

**Nota de bookkeeping:** o comentário em `biEngine.js` já citava P0-6 como
resolvido antes desta fase (`mealNutrients()` já tinha o fallback de 3
níveis) — só a caixa `[ ]` da Fase A não tinha sido atualizada. Corrigido
abaixo.

---

**Gap identificado, fora do âmbito desta fase — Fase E (auditoria de
cobertura):** o Índice de Prontidão (`calculateReadinessIndex`, T2,
`biEngine.js`) e os seus pilares NÃO chegam ao prompt da Carol — se o
atleta perguntar "porque é que o meu índice está a 62?" ela não tem o
número nem os componentes. Falta um inventário ecrã-a-ecrã (Corpo, Ginásio
holístico, distribuição de treino, etc.) a confirmar, para cada gráfico/
métrica, se já está em texto no prompt, atrás de uma tool call, ou em falta.
Qualquer cálculo novo que essa auditoria exigir deve nascer diretamente em
`_shared/formulas/`, nunca duplicado.
