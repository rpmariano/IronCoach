# Especificação técnica — Biblioteca de fórmulas centralizada

> Auditoria e proposta de arquitetura. Este documento não altera código — regista
> o estado atual (com evidência de ficheiro:linha) e a arquitetura recomendada
> para os corrigir sem os voltar a divergir.
>
> Companheiro: [`formulas-checklist.md`](./formulas-checklist.md) — checklist de
> validação acionável.

## 1. Porquê

Nesta sessão a "Previsão (VDOT)" mostrava tempos diferentes no `RaceHubView` e no
gráfico do `RunDashboard` para a mesma prova. Não era um bug de fórmula — era a
fórmula certa (`predictRaceTime`, fórmula de Riegel) alimentada com argumentos
diferentes, porque cada ecrã resolvia o nível de experiência e a distância
equivalente à sua maneira. Resolvido criando um único ponto de entrada,
`getRacePrediction(race, profile, runs)`.

A pergunta que motivou esta auditoria — *"estes cálculos não deveriam estar todos
centralizados?"* — está certa, e o caso da Previsão não era isolado. É o padrão
dominante do projeto: **não existe biblioteca de fórmulas — existem cópias**, no
frontend, e entre o frontend e o backend (edge functions que servem a Carol).

Dois exemplos já confirmados por leitura direta do código, em produção:

- **`coach-daily-summary/index.ts:347,423,446`** compara `gender === "masculino"` /
  `"feminino"`, mas `profiles.gender` só guarda `'M'`/`'F'`
  (`Perfil.jsx:452-453`). A comparação nunca é verdadeira: a fórmula de TMB usa
  sempre o ramo feminino (−166 kcal/dia para todos os homens) e o limiar de RED-S
  fica sempre em 8% (nunca dispara para mulheres entre 8% e 16% de massa gorda).
- **`biEngine.js:53`** classifica o ACWR com `ratio > ACWR_CAUTION_MAX` (1.49) onde
  devia usar `ACWR_SAFE_MAX` (1.30). Toda a banda de cautela da doutrina
  (1.31–1.49) aparece na app como "Ideal" — `ACWR_SAFE_MAX` está definida em
  `biConstants.js:9` e nunca é lida em lado nenhum.

Estes não são casos hipotéticos de "podia divergir" — já divergiram, silenciosamente,
e afetam o que a Carol diz ao atleta todos os dias.

## 2. Princípio

**Uma métrica, uma implementação.** Se um número aparece em mais de um ecrã, ou é
usado tanto pelo frontend como pela Carol, o cálculo vive num só sítio; todos os
consumidores importam-no. Nenhum ecrã recalcula, nenhuma edge function reimplementa.

Isto não é purismo — é a única forma de garantir que "ACWR 1.45" significa a mesma
coisa em todo o lado onde aparece, incluindo no mesmo prompt que a Carol lê.

## 3. Arquitetura

### 3.1 Localização: `supabase/functions/_shared/formulas/`

Não `src/utils/`, apesar de ser onde o frontend já tem a maior parte do código.
Motivo: `.github/workflows/deploy-edge-functions.yml:21-22` só dispara o deploy do
backend quando o push toca em `supabase/functions/**`:

```yaml
on:
  push:
    branches: [dev, master]
    paths:
      - "supabase/functions/**"
```

Se a biblioteca ficasse em `src/utils/` (ou numa pasta `shared/` na raiz), corrigir
uma fórmula e fazer push **não republicaria as edge functions** — a Carol continuaria
a usar a versão antiga sem que nada avisasse. É exactamente o buraco que o próprio
workflow descreve ter existido antes de ele existir (ver o seu cabeçalho de
comentário). Pôr a biblioteca dentro de `supabase/functions/` torna-a parte do que
o filtro de path já vigia.

### 3.2 Regra de pureza

Zero dependências de runtime: nada de `date-fns`, nada de `jsr:@supabase/...`, nada
de React. Os ficheiros da biblioteca só podem receber e devolver primitivos
(`number`, `string`, objetos simples) — datas já resolvidas como `'YYYY-MM-DD'`,
não `Date`. Isto é o que permite ao mesmo ficheiro `.ts` correr sem alterações no
Vite (browser/Node) e no Deno das edge functions.

Consequência prática: funções como `calculateACWR` que hoje recebem uma lista de
`runs` e fazem `parseISO`/`isAfter` (date-fns) por dentro têm de ser divididas —
a filtragem por data fica no chamador (que já tem date-fns ou já sabe formatar a
data em ISO), a fórmula pura (`agudo/crónico → ratio → zona`) fica na biblioteca.

### 3.3 Formato e imports

- Ficheiros `.ts`, com **extensão explícita nos imports** (`import { computeACWR }
  from './acwr.ts'`) — exigência do Deno; o Vite já transpila TypeScript
  nativamente e aceita a extensão sem alterações.
- `vite.config.mjs` tem `test.include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}']` —
  precisa de passar a incluir `supabase/functions/_shared/**` para o Vitest correr
  os testes de paridade da biblioteca a partir do frontend também.
- Consumo:
  - Edge functions: caminho relativo (`../_shared/formulas/acwr.ts`).
  - Frontend: alias Vite (`@formulas/acwr` → `supabase/functions/_shared/formulas/acwr.ts`),
    configurado em `vite.config.mjs` (`resolve.alias`).

### 3.4 Camadas

**T0 — Vocabulário e constantes.** O nível mais barato e mais importante: valores
de enum canónicos e os seus normalizadores, e as tabelas numéricas da doutrina.

```ts
// supabase/functions/_shared/formulas/vocabulary.ts
export type Gender = 'M' | 'F';
export function normalizeGender(raw: string | null | undefined): Gender | null {
  if (raw === 'M' || raw === 'F') return raw;
  if (raw === 'masculino' || raw === 'm') return 'M';
  if (raw === 'feminino' || raw === 'f') return 'F';
  return null;
}
```

É a camada que resolve o bug de género (§1) de raiz: qualquer chamador, em
qualquer runtime, que use `normalizeGender()` em vez de comparar strings à mão,
fica imune a esta classe de erro. Não é coincidência que o bug em produção seja
precisamente uma comparação de string feita à mão em vez de usar um vocabulário
partilhado.

**T1 — Fórmulas puras.** Uma entrada, uma saída, sem I/O: ACWR, VDOT
(Daniels-Gilbert), Riegel, equivalente ITRA (trail), Mifflin-St Jeor + GETD,
Tanaka/Karvonen, Epley (1RM), `categorizeDistance`, viabilidade de prova
(`assessRaceViability`), desgaste de sapatilhas (`weightFactor` /
`effectiveLifespanKm`).

**T2 — Composição.** `calculateRaceTrainingPlan`, `calculateReadinessIndex`,
`detectCoachInsights` continuam a viver no frontend (`src/utils/`) — são
orquestração específica de ecrã, com estado e formatação. Mas passam a **consumir**
T0/T1 em vez de reimplementar. Não há equivalente T2 no backend: as edge functions
compõem os seus próprios textos de prompt a partir de T0/T1 diretamente.

### 3.5 Rastreabilidade à doutrina

Cada constante e fórmula leva uma referência ao bloco de doutrina de onde vem,
seguindo a convenção que os testes já usam informalmente ("Bloco 2.3 #2"):

```ts
/**
 * @doutrina src/coach-knowledge/02-corrida-prova.md #3 (equivalente ITRA)
 * @doutrina specs/coach-investigacao.md L1212-1231
 * Fator MVP: 100 m D+ = 1,0 km plano (Naismith). Não distingue declive.
 */
export function equivalentFlatKm(distanceKm: number, elevationGainM: number | null, terrain: 'estrada' | 'trail'): number {
  if (terrain !== 'trail' || !elevationGainM) return distanceKm;
  return Math.round((distanceKm + elevationGainM / 100) * 10) / 10;
}
```

Isto transforma "a doutrina diz X, o código faz Y" de invisível (só descoberto por
auditoria manual, como esta) em algo que aparece no diff sempre que um dos dois
lados muda sem o outro.

### 3.6 Vetores dourados (golden vectors)

Um ficheiro JSON por fórmula em `supabase/functions/_shared/formulas/__golden__/`,
com pares entrada→saída esperada:

```json
// acwr.golden.json
[
  { "input": { "acuteKm": 45, "chronicWeeklyKm": 40 }, "expect": { "ratio": 1.125, "zone": "safe" } },
  { "input": { "acuteKm": 60, "chronicWeeklyKm": 40 }, "expect": { "ratio": 1.5,   "zone": "danger" } }
]
```

Consumido por **dois** testes — um Vitest (`src/utils/__golden__.test.js` ou
similar) e um Deno test (`supabase/functions/_shared/formulas/__golden__.test.ts`)
— que percorrem o mesmo JSON e chamam a mesma função nas duas runtimes. É a
garantia barata de que Vite e Deno dão o mesmo número; substitui a esperança
(que já falhou, três vezes, no ACWR) de que as cópias não divirjam.

## 4. Inventário

Cada linha: métrica · onde está hoje (cópias) · destino (camada) · estado.

| Métrica | Cópias hoje | Camada destino | Estado |
|---|---|---|---|
| Vocabulário de género | `Perfil.jsx` (grava) · `biEngine.js:838` · `coach-chat:1849,1902,2732` · `coach-daily-summary:347,423,446` (❌ comparação errada) | T0 | 🔴 P0 |
| `todayISO` (hoje local) | `lib/utils.js:3` (canónica, 2 importadores) + 12 cópias locais + `biEngine.js:1141` em UTC (❌) | fica em `lib/utils.js` (é I/O de data, não pertence a T0/T1) | 🔴 P0 (o caso UTC) / 🟠 (as cópias) |
| ACWR (corrida) | `biEngine.js:80` (sRPE) · `coach-chat:911` (km, janela 8d/29d) · `coach-daily-summary:391` (km, janela 7d/28d) | T1, uma só grandeza de carga e uma só janela — **decisão em aberto, ver §5** | 🔴 P0 + duplicada |
| Classificação de zona ACWR | `biEngine.js:47-56` (`resolveAcwrStatus`, ❌ limiar errado) · `coach-chat:929-932` (correto) · `coach-daily-summary:359` (só um limiar) | T1 | 🔴 P0 |
| VDOT (Daniels-Gilbert) | `biEngine.js:317` (único sítio que a calcula) | T1 | ✅ só precisa de mudar de casa |
| Previsão de tempo (Riegel) | `biEngine.js:257` (`predictRaceTime`) + `getRacePrediction` (composição, já corrigido nesta sessão) | T1 (a fórmula) / T2 (a composição fica) | ✅ |
| Equivalente ITRA (trail) | `racePlanEngine.js:104` (`calculateEquivalentFlatKm`) — único sítio | T1 | ✅ |
| Mifflin-St Jeor + GETD/TDEE | `coach-chat:1902-1908` (×1.3 + custo) · `coach-daily-summary:441-449` (×1.55, sem custo) — ❌ divergem | T1, um só fator (§5) | 🔴 P0 |
| Tanaka + Karvonen (zonas FC) | `coach-chat:2752-2767` — único sítio | T1 | ✅ |
| Epley (1RM) | `biEngine.js:451` — único sítio | T1 | ✅ |
| `categorizeDistance` | `raceViability.js:47` · `coach-chat` (`viabCatDist`, ~1521) · `coach-daily-summary:156` (`viabCatDist`) — 3 cópias, limiares idênticos hoje | T1 | 🟠 duplicada |
| Tabelas `MIN_PREP_WEEKS`/`MIN_VOLUME_KM` | `raceViability.js:25,37` · `coach-chat:1506-1519` (`VIAB_MIN_WEEKS`/`VOL`) · `coach-daily-summary:149-154` | T0 (dados de doutrina) | 🟠 duplicada (40 valores batem hoje — verificado célula a célula) |
| Taper | `racePlanEngine.js:86` (`getTaperWeeks`, recebe `experienceLevel` e não o usa) · `coach-chat:1530-1544` (`daysUntil<=14` fixo) · `coach-daily-summary:177` (idêntico) · `biEngine.js:900-916` (limiares km próprios, 35/15) | T1, uma só regra (§5) | 🔴 P0 + 4 implementações incompatíveis |
| Recuperação pós-prova | `racePlanEngine.js:73` (`getRecoveryDaysAfterRace`) — único sítio, mas só distingue avançado/resto (doutrina tem 4 níveis) | T1 | 🟠 simplificado face à doutrina |
| Tendência de peso | `biEngine.js:495` (EWMA α=0.25) · `coach-chat:1818-1823` (média simples 7d) · `coach-daily-summary:427-437` (regressão 2 pontos) — ❌ 3 fórmulas | T1, uma só (§5) | 🔴 P0 |
| Limiar de perda de peso rápida | `biConstants.js:100-105` (%/semana por nível) · `coach-chat:1837` (1.5%/72h) · `coach-daily-summary:410` (0.9 kg/sem absoluto) | T0/T1 | 🟠 duplicada, incoerente |
| Gordura visceral | `coach-chat:1867-1870` (correto: 1-9/10-14/≥15) · `biEngine.js:849` (❌ só `>=14`) | T1 | 🔴 P0 |
| EA / RED-S | `biEngine.js:645` (`calculateEnergyAvailability`, único cálculo) | T1 | 🟠 usa `lean_body_mass_kg` da BIA como denominador — a doutrina (`04-nutricao-seguranca.md:40`) diz que não serve para isto (§5) |
| Nutrientes por 100g | `nutrition.js:40` (`itemNutrients`, 3 níveis de fallback) · `biEngine.js:594-600,665-668` (❌ inline, só 1 nível) · `coach-daily-summary:98` (`totalsFromMeal`, inline) | T1 (a fórmula de fallback) | 🔴 P0 |
| Sapatilhas (desgaste) | `shoes.js:36-57` (único no frontend) · `coach-chat:3106-3120` (reimplementado, sem os limiares de aviso) · `estimate-shoe-lifespan:37` (`REFERENCE_WEIGHT_KG` de novo) | T1 | 🟠 duplicada |
| `weeksToRace` (viabilidade) | `racePlanEngine.js:202` · `biEngine.js:952,1152` (cópia literal uma da outra) · `RunAgenda.jsx:155` (❌ sem correção "em curso", sem `racePriority`) | T2, uma função | 🔴 P0 |
| `formatPace` | `run.js:128` (canónica, `"5.20"`) · `RunCard.jsx:39` (`5'20"/km`) · `RunDashboard.jsx:16` (`5:20/km`) · `ScatterTrendChart.jsx:9` (`5:20`) · `coach-chat:1603` | apresentação, não é T0/T1 — mas só deve existir 1 implementação de cálculo + N de formatação que a chamem | 🟠 duplicada, viola convenção documentada |
| `formatDuration` | `run.js:93` (canónica) + 4 cópias/variantes | idem | 🟠 duplicada |
| `sessionVolumeKg` | `biEngine.js:377` (existe, importada 3× dentro do próprio ficheiro) · `GymDashboard.jsx:38` e `GymSessionCard.jsx:52` (❌ reimplementam sem o fallback `volume_kg`) | T1 | 🟠 função certa, zero adoção fora de `biEngine.js` |
| Compliance nutricional (limiares) | `NutritionDashboard.jsx:174` (85/115) · `OverviewDashboard.jsx:96` (90/70/115, "sabe" que duplica) · `biEngine.js:1103` (75/90/110) | T0 | 🟠 3 escalas diferentes |
| `MEAL_DOCTRINE` / `DIETARY_RESTRICTION_INFO` | `coach-chat:1571,1461` (completas) · `coach-daily-summary:47,37` (parciais) · `analyze-meal:409,360` (parciais) | T0 (texto de doutrina, não fórmula, mas mesmo princípio) | 🟠 triplicada com conteúdo diferente |
| Distribuição 80/20 | `biEngine.js:183` (`calculateTrainingDistribution`) — único cálculo, mas `RunDashboard.jsx:141` chama-o sem o argumento de nível | T1 (a fórmula está bem; falta o chamador passar o argumento) | 🔴 P0 no chamador |

## 5. Decisões em aberto

Estas não têm resposta "óbvia" — mudam números que o atleta vê, e a refactorização
seguinte precisa de as resolver explicitamente, não por omissão:

1. **ACWR: carga em km ou em sRPE (duração×RPE)?** A doutrina
   (`02-corrida-carga-progressao.md`) enquadra o ACWR em volume; as duas edge
   functions usam km; só o frontend usa sRPE. Escolher uma grandeza única, e
   alinhar o limiar de perigo (`>` vs `>=` 1.50) e a janela aguda (7 vs 8 dias).
2. **Taper: qual das 4 regras?** A tabela da doutrina (nível × distância × A/B/C)
   é a mais rica; nenhuma implementação atual a usa por inteiro.
3. **Tendência de peso: EWMA, média simples ou regressão de 2 pontos?**
4. **TDEE: fator 1.3+custo (coach-chat) ou 1.55 sem custo (daily-summary)?** A
   doutrina (`04-nutricao-base-diaria.md:81`) aponta para 1.2-1.4 + custo separado
   — mais perto do coach-chat, mas a decisão final e a validação ficam para quem
   tratar da refactorização.
5. **EA: manter `lean_body_mass_kg` (BIA) como denominador?** A doutrina
   (`04-nutricao-seguranca.md:40`) diz que a BIA não é precisa o suficiente para
   ser usada como denominador de um cálculo, só para tendência ao longo do tempo.

## 6. Faseamento

- **Fase A — P0 em produção.** Os 8 itens da checklist marcados P0. Não esperam
  pela biblioteca: são correções de 1-3 linhas cada, no sítio onde já estão.
- **Fase B — T0 + guardas.** Criar `_shared/formulas/vocabulary.ts` e as tabelas
  de doutrina; migrar os consumidores de género/nível/prioridade; escrever os
  testes-guarda (ver checklist).
- **Fase C — T1 e eliminação de cópias.** Uma fórmula de cada vez, com vetor
  dourado antes de mover, migrar todos os consumidores, apagar a cópia antiga.
- **Fase D — Higiene de `src/components/`.** As ~20 cópias locais de
  `todayISO`/`formatPace`/`formatDuration` que não são bugs numéricos, só
  duplicação de código — menor risco, pode correr em paralelo com C.

## 7. Referências

- Auditoria completa (3 sub-relatórios: `src/utils/`, `src/components/`, edge
  functions + doutrina) — realizada nesta sessão, disponível no histórico da
  conversa que gerou este documento.
- `specs/coach-investigacao.md` — investigação-fonte da doutrina.
- `src/coach-knowledge/*.md` — doutrina consolidada por bloco.
- `docs-notion/4_qualidade_testes.md` — suites de teste existentes (frontend
  Vitest, backend Deno) que a Fase B/C estende.
