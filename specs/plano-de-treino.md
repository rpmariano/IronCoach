# Spec — Plano de Treino Acordado com o Coach

Estado: **base de dados, store, Início e conclusão de treinos implementados
(2026-08-10). Falta a emissão da proposta pelo coach-chat (§5.1) — sem isso,
não há forma de criar um plano; o resto do fluxo (§5.2-§5.4) já funciona
sobre planos criados diretamente na base de dados.**
Contexto: `specs/coach-investigacao.md` (doutrina e limiares), PRD 3.1 (Início),
3.2 (Nutrição), 3.4 (Corrida), 3.6 (Coach).

---

## 1. O problema que isto resolve

A app é **retrospetiva por desenho** — o PRD diz que os atletas registam os
dados *"após a realização dos mesmos"*. Só as provas (`race_events`) existem
no futuro.

Isso cria um limite real: a doutrina de nutrição (Bloco 4.1 da investigação)
diz que os hidratos devem variar com o treino do dia — 5 g/kg em descanso,
10 g/kg em dia de treino longo, num avançado. Mas **uma app retrospetiva não
sabe o que vais fazer hoje**, e portanto não consegue dizer-te o que comer.

A saída não é construir um plano de treino completo. É mais simples: **quando
é o próprio coach a recomendar o treino, ele já sabe o que aí vem.** A
recomendação torna-se o plano, e só nesse caso a app pode ser prospetiva.

## 2. Os três modos do Coach

Fica explícito, porque condiciona toda a doutrina:

| Modo | Quando | Natureza |
|---|---|---|
| **Retrospetivo** | omissão, a maior parte do tempo | corretivo e educativo — *"ontem correste 18 km e ficaste em 4 g/kg de hidratos; precisavas de ~7"* |
| **Proativo** | só com `race_events` agendada | *"prova daqui a 12 dias, começa o taper"* |
| **Plano** | quando o coach recomenda no chat E o atleta aceita | *"longão amanhã de manhã"* → objetivos do dia ajustam-se |

Fora destes três casos, o coach **não** define objetivos diários.

## 3. Modelo de dados

### 3.1. `coach_plans` — o acordo

Um plano é um conjunto de treinos proposto pelo coach para um período. Existe
como entidade própria porque **o atleta tem de o aceitar** — a proposta e o
compromisso são momentos distintos.

```
id            uuid pk
user_id       uuid not null → auth.users
status        text  'proposto' | 'aceite' | 'recusado'
period_start  date  not null
period_end    date  not null
summary       text  resumo do coach ("4 treinos, foco em base aeróbica")
created_at    timestamptz
accepted_at   timestamptz nullable
```

### 3.2. `coach_plan_items` — cada treino

```
id                    uuid pk
plan_id               uuid not null → coach_plans
user_id               uuid not null  (desnormalizado, para RLS simples)
planned_date          date not null   -- o dia pretendido
kind                  text 'corrida' | 'ginasio'
training_type         text nullable   -- enum de runs.training_type, quando kind='corrida'
categories            text[] nullable -- grupos musculares, quando kind='ginasio'
target_distance_km    numeric nullable
target_duration_min   integer nullable
notes                 text nullable   -- "Z2, fácil, sem olhar ao ritmo"
status                text 'pendente' | 'concluido' | 'cancelado'
actual_date           date nullable   -- preenchido ao concluir; pode diferir de planned_date
completed_run_id      uuid nullable → runs
completed_session_id  uuid nullable → workout_sessions
created_at            timestamptz
```

**Os itens nunca expiram.** Ficam `pendente` até o atleta os concluir ou
cancelar — decisão deliberada, para não haver estado "falhado" nem lógica de
limpeza automática. Um item por fazer há duas semanas continua visível até
ser resolvido.

## 4. Objetivos de nutrição — calculados, nunca guardados

**Esta é a decisão central da spec.**

Os objetivos ajustados **não são gravados em lado nenhum**. São calculados a
partir dos itens do plano, sempre que preciso. Isto resolve de graça o
problema que motivou toda a discussão:

- Se o atleta faz o longão no sábado em vez do domingo, o `actual_date` muda
  e **os objetivos dos dois dias corrigem-se sozinhos** — o domingo perde o
  valor elevado, o sábado ganha-o. Não há reconciliação a fazer, nem dados
  a atualizar.
- Não existe estado duplicado que possa ficar dessincronizado.

### Regra de cálculo

Para uma data D, o objetivo efetivo é a linha de base do perfil mais o
ajuste de qualquer item do plano que afete D:

- **Item concluído** → conta na `actual_date`.
- **Item pendente** → conta na `planned_date`.
- **Item cancelado** → não conta.

Um item pode afetar **até três dias**: a véspera (carga de hidratos antes de
um longo — ver Nutrição 4.1 #2), o próprio dia (calorias e hidratos de treino,
água), e o dia seguinte (recuperação). Que ajuste se aplica a que dia sai da
doutrina, não desta spec.

### Impacto no código

`dayNutrientStatus(meals, dateStr, profile)` passa a receber os itens do
plano: `dayNutrientStatus(meals, dateStr, profile, planItems)`. O mesmo para
`dayWaterGoalMet`.

Alcance pequeno — só há **um** ponto de uso em produção
(`NutritionCalendar.jsx:50-51`). Os testes em `nutrition.test.js` cobrem bem
a função e devem ganhar casos com plano.

**Efeito colateral que isto evita**: sem este ajuste, um dia de longão em que
o atleta comeu mais — corretamente — apareceria a **vermelho** no calendário,
porque excedeu a meta base. O coach estaria a penalizar visualmente o
comportamento que ele próprio recomendou.

## 5. Fluxo

### 5.1. Proposta e aceitação

1. No chat, o atleta pede um plano ("o que devo fazer para a semana?").
2. O coach responde em texto **e** emite a proposta estruturada — cria
   `coach_plans` com `status='proposto'` e os respetivos itens.
3. O atleta vê a proposta e aceita ou recusa. Ao aceitar, `status='aceite'`
   e o plano passa a aparecer no Início.

⚠️ **Requer output estruturado do modelo.** Não chega o coach responder em
prosa bonita — a Edge Function tem de extrair "longão, 15 km, 10/08" e
gravá-lo. É o mesmo mecanismo de veredito estruturado descrito no PRD 3.6.1;
sem ele, o coach recomenda e a app não fica a saber de nada.

### 5.2. Concluir um treino

É este passo que resolve o problema mais difícil — saber se o treino acordado
aconteceu:

1. No Início, o atleta carrega em **Concluir** no item.
2. Abre o ecrã de registo correspondente (`RunRegistration` ou
   `GymRegistration`) **com os campos já preenchidos** a partir do item.
3. A data vem pré-preenchida com `planned_date`, mas é **editável** — é aqui
   que a mudança de dia fica capturada, no momento em que acontece.
4. Ao gravar, o item passa a `concluido`, guarda `actual_date` e o
   `completed_run_id`/`completed_session_id`.

**Porque é que isto importa**: a alternativa seria adivinhar, a posteriori,
se uma corrida registada correspondia a um item do plano — comparando semana,
tipo e distância. Seria frágil e daria falsos negativos. Com a ligação
explícita, não há nada a inferir.

### 5.3. Cancelar

Um botão **Cancelar** marca `status='cancelado'`. O item deixa de contar para
objetivos de nutrição e sai da lista ativa.

### 5.4. Treino não planeado (caso não coberto)

Se o atleta treinar sem passar pelo item — ou fizer algo que não estava
planeado — o registo fica sem ligação e o item continua `pendente`. É um
caminho aceitável, mas deixa o plano a mostrar menos do que a realidade.

**Mitigação v2** (fora do âmbito): permitir ligar um item a um registo já
existente ("já fiz este").

## 6. Início — o que muda

O Início passa a ter os **3 cartões fixos atuais**, e o espaço da grelha
personalizável dá lugar ao plano:

```
┌─ Próxima Prova ──────────────┐  (NextRaceCard, mantém-se)
├─ Nutrição ───────────────────┤  (NutritionHeroCard, mantém-se)
├─ Água ───────────────────────┤  (WaterHomeCard, mantém-se)
├─ Plano da semana ────────────┤  ← NOVO, ocupa o espaço da grelha
│  2ª  Contínuo 8 km      [✓][✗]│
│  4ª  Intervalos         [✓][✗]│
│  6ª  Ginásio · Pernas   [✓][✗]│
│  Dom Longão 15 km       [✓][✗]│
│      ↳ hidratos +2 g/kg na    │
│        véspera                │
└───────────────────────────────┘
```

Cada linha mostra o dia, o treino e as duas ações (concluir / cancelar). As
metas nutricionais associadas aparecem como **guia**, ligadas ao item que as
origina — não como número solto.

🔲 **Por decidir**: a grelha personalizável (`profiles.home_layout`,
`HOME_CARD_DEFS`) desaparece por completo, ou passa para outro sítio? O
utilizador já pode ter uma configuração guardada; removê-la em silêncio
perde essa escolha.

## 7. Alterações necessárias por ficheiro

| Ficheiro | Alteração | Estado |
|---|---|---|
| `supabase/migrations/20260810000000_coach_plans.sql` | duas tabelas novas + RLS `own rows` | ✅ aplicado |
| `supabase_schema.sql` | registado a par | ✅ |
| `src/utils/nutrition.js` | `dayNutrientStatus` recebe itens do plano; `planAffectsDay()` é o heurístico mínimo (só isenta calorias/hidratos no próprio dia de um item de corrida longa — a fórmula g/kg completa aguarda o motor de doutrina) | ✅ MVP |
| `src/components/Nutrition/NutritionCalendar.jsx` | passa `coachPlanItems` (único ponto de uso) | ✅ |
| `src/components/Home/Home.jsx` | `WeeklyPlanCard` no lugar da grelha; grelha personalizável removida por completo | ✅ |
| `src/components/Run/RunRegistration.jsx` | consome `planItemPrefill` do store no mount; ao gravar manualmente, chama `completePlanItem` | ✅ |
| `src/components/Gym/GymRegistration.jsx` | idem | ✅ |
| `src/store/index.js` | `coachPlans`/`coachPlanItems` carregados em `loadInitialData`; `completePlanItem`/`cancelPlanItem`/`planItemPrefill` | ✅ |
| `supabase/functions/coach-chat/index.ts` | emitir a proposta estruturada; ler o plano ativo para contexto | ❌ **por fazer** — sem isto não há forma de criar um plano a partir do chat |

## 8. Questões em aberto

1. **A grelha personalizável do Início** — remover ou realojar (ver 6).
2. **Ligar itens a registos já feitos** — mitigação do 5.4, adiada para v2.
3. **Acumulação de itens pendentes** — como nunca expiram, um utilizador que
   ignore a funcionalidade acumula itens indefinidamente. Não é grave, mas ao
   fim de meses a lista fica longa. Talvez arquivar automaticamente ao fim de
   N semanas, mantendo o estado `pendente` (arquivado ≠ falhado).
4. **Objetivos duradouros vs. plano** — um acordo do tipo "vamos perder peso"
   escreve nas colunas de `profiles` (com o *toggle* e a cor do módulo Coach
   a marcar a origem). Isso é **outra funcionalidade**, complementar a esta:
   o plano ajusta o dia, o acordo duradouro muda a linha de base. Convém
   desenhar as duas em conjunto para a interface não ficar confusa sobre de
   onde vem cada número.
