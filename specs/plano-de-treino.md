# Spec — Plano de Treino Acordado com o Coach

Estado: **implementado (2026-08-10).** O ciclo completo funciona: o coach
propõe no chat (`propose_training_plan`), o atleta aceita/recusa no Início,
conclui cada treino pelo ecrã de registo pré-preenchido, e os objetivos de
nutrição ajustam-se em consequência. Falta apenas o refinamento do cálculo
nutricional (ver §4 — o heurístico atual só cobre o próprio dia de um longo).
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

**Como está implementado**: `propose_training_plan`, uma quarta ferramenta no
mecanismo de *function calling* que o `coach-chat` já usava para ler histórico.
É a **única que escreve** — as outras três só leem — daí três cuidados
próprios:

- **Valida tudo antes de gravar qualquer coisa.** Um item inválido a meio
  deixaria um plano meio criado, que o atleta veria como proposta legítima.
- **`training_type` vai como `enum` no schema da ferramenta**, com as mesmas
  chaves de `runs.training_type`. O modelo não consegue inventar um tipo que
  o *check constraint* rejeitaria.
- **Rollback explícito**: se os itens falharem depois do plano estar gravado,
  o plano é apagado. Sem isso ficava uma proposta vazia visível no Início.

O resultado da ferramenta volta ao modelo, que menciona a proposta na resposta
final. A função devolve `plan_proposed: true` ao cliente, que recarrega os
planos para a proposta aparecer no Início sem refrescar a página.

**Enquanto `proposto`, os itens não contam para nada** — não aparecem como
treinos a fazer nem ajustam objetivos de nutrição. Só depois de `aceite`.

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
| `supabase/functions/coach-chat/index.ts` | ferramenta `propose_training_plan` (a única de escrita); `buildPlanContext()` dá ao coach os treinos que já propôs e continuam por resolver; devolve `plan_proposed` ao cliente | ✅ |
| `src/components/Coach/Coach.jsx` | recarrega os planos quando `plan_proposed`; **corrigido bug pré-existente** — lia `data.reply`, campo que a função nunca devolveu, pelo que mostrava sempre o texto de fallback em vez da resposta real | ✅ |

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

## 9. Sugestão alimentar por dia (2026-08-11)

Implementa a **forma de entrega 2** decidida no Bloco 7 da investigação: a
sugestão alimentar colada ao treino do dia — *"o que comer no dia em que vais
fazer isto"*.

### Modelo

| Alteração | Porquê |
|---|---|
| `coach_plan_items.meal_suggestion text` | Texto sempre generalizado por categoria/quantidade redonda — o enquadramento **sugestão educativa, nunca prescrição** mantém-se. As metas do dia continuam a sair de `planAffectsDay()`; isto não muda. |
| `coach_plan_items.meal_macros jsonb` (2026-09-05: tentado, revertido, **retomado com sucesso no mesmo dia**) | `meal_items[]` (refeições) + `meal_estimated_kcal/protein_g/carbs_g/fat_g`, campos **IRMÃOS** de `meal_suggestion`/`meal` (não aninhados dentro de um `OBJECT` à parte) e todos **opcionais** — a Carol pensa em alimentos/gramas concretos para calcular macros reais, mas o texto de `meal_suggestion` continua sempre a versão generalizada de sempre, extraída de forma totalmente independente. Alimenta os anéis de `WeeklyPlanCard.jsx` com a estimativa real da sugestão (rótulo "Estimativa desta sugestão"); sem `meal_macros` válido (sugestões antigas, campos parciais, ou o modelo não os preencheu — são opcionais), o frontend cai no objetivo diário do perfil. **1ª tentativa revertida horas antes**: a mesma ideia dentro de um `OBJECT meal_suggestion` à parte (`items[]` → `OBJECT` → `meal_suggestion(OBJECT)` → `items[]` → `OBJECT`) fazia a API de function calling do Gemini devolver `400 INVALID_ARGUMENT` em **qualquer** mensagem ao Coach — as tools vão todas em cada chamada, independente da que o modelo escolhe. A forma nova (campos soltos, mesma profundidade do `items[]`/`suggestions[]` de topo que já funcionava) foi validada diretamente contra a API real do Gemini (function Edge temporária, descartada depois) antes deste redeploy — ver `MEAL_MACROS_SCHEMA_PROPERTIES`/`buildMealMacros` em `coach-chat/index.ts`. |
| `kind` passa a aceitar `'descanso'` | Um dia sem treino pode ter sugestão alimentar (véspera de longão, recuperação). Sem este valor não havia onde a pendurar. Não afeta nutrição — `planAffectsDay()` exige `kind='corrida'`. |

Um item `descanso` sem `meal_suggestion` **nem** `notes` é rejeitado na Edge
Function: só ocuparia uma linha vazia, e a rejeição ensina o modelo a não
encher o plano de dias vazios para "cobrir a semana".

### Interface

`WeeklyPlanCard` saiu de `Home.jsx` para ficheiro próprio e mudou de forma:

- **Horizonte fixo de 7 dias**, sempre. Antes listava só os itens pendentes, o
  que fazia o cartão encolher ao longo da semana — e um dia sem treino
  desaparecia, mesmo tendo sugestão alimentar.
- **Resumo + expansão**, no molde do `MealCard`: a linha fechada diz o
  essencial, o detalhe abre a pedido. Sete dias abertos seriam ilegíveis.
- Um item concluído aparece no dia em que **aconteceu** (`actual_date`), não no
  planeado — a mesma regra de `planAffectsDay()`.
- A sugestão usa a pele da "Análise do Coach" do `MealCard`, para o atleta
  reconhecer a voz, com rodapé fixo a marcar que é sugestão e não prescrição.

### Verificado

Migração aplicada e espelhada em `supabase_schema.sql`; 41 testes Deno e 145
Vitest verdes; render confirmado no browser com uma sugestão temporária,
reposta a `null` depois.

### Por fazer

O modelo **pode** preencher `meal_suggestion`, mas nada na doutrina lhe diz
ainda *o que* escrever — as tabelas do Bloco 7 #1/#2 (distribuição por refeição
e equivalência g/kg→alimentos INSA/PortFIR) só entram quando existir
`src/coach-knowledge/`. Até lá as sugestões saem do conhecimento geral do
modelo, não da literatura registada.

## 10. Correção de meals.coach_notes (2026-08-11)

O comentário automático por refeição (Bloco 7, forma de entrega 1) já
existia — `analyze-meal` gera `coach_notes` a cada refeição registada,
comparando com a meta diária e a média das últimas 5 refeições do mesmo
tipo. Nunca foi preciso desenhar o gatilho de propósito: acontece sempre,
em todos os modos de registo (foto e manual).

O que faltava era a correção: o prompt não sabia nada sobre restrições
alimentares. Um vegetariano podia receber "adiciona frango" como sugestão
final — exatamente o cenário que motivou o campo `dietary_restrictions`.

Corrigido: `attachMealCoachNotes` passa a incluir `dietary_restrictions` e
`dietary_notes` na busca ao perfil, e `dietaryRestrictionsPromptBlock()`
(nova função, testada isoladamente) monta o bloco de restrições que entra no
prompt do Gemini, com a mesma regra dura usada no `coach-chat`: nunca sugerir
o que a restrição proíbe, mesmo em troca de não sugerir nada.

Esta é a **terceira cópia** de `DIETARY_RESTRICTION_INFO` (a primeira em
`src/utils/diet.js`, a segunda em `coach-chat/index.ts`) — cada Edge Function
empacota só a sua pasta, por isso não há forma de partilhar código entre
elas sem um passo de build extra. Se as restrições mudarem, mudar as três.

Verificado: 7 testes Deno novos, os 41 existentes do `coach-chat` continuam
verdes. Função `analyze-meal` reimplantada (v20).

## 11. Card-resumo do Coach na Home (2026-08-11)

Implementa a **forma de entrega 3** decidida no Bloco 7: um card rotativo no
Início com até quatro mensagens independentes — recapitulação recente, avisos
de hoje, sugestão de refeição, preparação para amanhã.

### Geração — decisão

1x por dia, cacheado, gerado na **primeira abertura da app nesse dia** — não a
cada abertura. Mantém o custo de Gemini proporcional a utilizadores ativos por
dia, não a aberturas da app. Troca aceite: o resumo pode ficar desatualizado
se o atleta treinar a meio do dia — aceitável para um resumo; os alarmes
continuam a sair de `dayNutrientStatus`, calculado ao vivo. Um botão
"Atualizar" no card força regeneração (`force: true`).

### Modelo

`coach_daily_summary` — uma linha por `(user_id, date)`, upsert na segunda
geração do mesmo dia (nunca acumula). Cada mensagem é uma coluna nullable —
o card só mostra as preenchidas.

### Edge Function

`coach-daily-summary`: sem `force`, devolve a linha de hoje se existir sem
chamar o Gemini. Contexto enviado: metas diárias, refeições/água de hoje,
corridas/ginásio dos últimos 7 dias, itens do plano de hoje, amanhã e depois
de amanhã (cada dia no seu próprio balde — `plano_treino_hoje_<data>`,
`plano_treino_amanha_<data>`, `plano_treino_depois_de_amanha_<data>`; o
balde de "depois de amanhã" é só contexto extra, o prompt proíbe descrevê-lo
como fazendo parte de amanhã), próxima prova, restrições alimentares (mesma
regra dura das outras funções — nunca sugerir o que a restrição proíbe). É a
**quarta cópia** de `DIETARY_RESTRICTION_INFO` — ver a nota em
`analyze-meal/index.ts`.

### Interface

`CoachDailySummaryCard` — mesma família visual do `NextRaceCard` (glass, glow
radial, 28px de raio), paleta cyan do módulo Coach. Navegação manual por
toque entre mensagens (sem rotação automática por temporizador). Estado de
carregamento com esqueleto; estado vazio quando não há nada a assinalar.

### Verificado

Migração aplicada e espelhada; Edge Function testada (8 testes Deno na função
pura de contexto) e reimplantada; store com 7 testes; componente com 8 testes
RTL — **um deles apanhou um bug real**: um campo com só espaços em branco
("  ") não era filtrado como ausente, por não haver `.trim()` antes do
filtro. Corrigido antes de fechar a tarefa.

Confirmado ponta a ponta no browser com dados reais: o Gemini gerou uma
recapitulação real a partir do histórico ("Estás sem treinar há 5 dias...").
160 testes Vitest + 41 Deno (coach-chat) + 8 (analyze-meal) + 8 (coach-daily-summary)
= todos verdes; build limpo.

## 12. Toggle de metas escritas pelo Coach (2026-08-11)

Implementa a **camada 1** da DECISÃO N1: o Coach pode escrever proteína e
gordura diretamente no perfil, mas só se o atleta autorizar, e o valor fica
marcado como "definido pelo Coach" na interface.

### Porque só proteína e gordura

DECISÃO N1 distingue metas **estáveis** (proteína, gordura — mudam com peso e
nível, não com o dia) de metas **variáveis** (calorias, hidratos, água — mudam
por dia consoante o treino, calculadas em `planAffectsDay()`, nunca gravadas
fixas). Escrever calorias/hidratos aqui contrariaria a própria decisão que
motivou esta funcionalidade — por isso a ferramenta do Coach nem aceita esses
campos.

### Modelo

`profiles.coach_can_set_nutrition_goals` (autorização), `protein_goal_set_by_coach`
e `fat_goal_set_by_coach` (origem do valor atual, só para a UI). Uma edição
manual do atleta desliga a flag correspondente — o valor deixa de ser "do
coach" no momento em que é substituído.

### Coach

Nova ferramenta `update_nutrition_goals`. A autorização é verificada no
**executor**, não na declaração — a ferramenta fica sempre visível ao modelo,
mas recusa escrever sem o interruptor ligado, dizendo ao modelo para orientar
o atleta a ativá-lo. O prompt já avisa antecipadamente se a autorização está
ligada ou não, para o modelo não gastar uma ronda de function-calling a
tentar às cegas.

### Interface

Perfil → Metas → toggle "O Coach pode ajustar as metas", com a mesma
estética do toggle de lembretes de água. Os campos de Proteína e Gordura
mostram um selo "Coach" (cor do módulo Coach) quando o valor atual veio dele;
editar o campo à mão remove o selo e grava as duas mudanças juntas (valor +
flag) na mesma gravação.

### Bug real encontrado e corrigido

Ao testar a ferramenta ponta a ponta, o `coach-chat` devolveu 502 com
`"Role 'function' is not supported"` — a geração atual do Gemini por trás do
alias `-latest` deixou de aceitar `role: "function"` no turno que devolve o
resultado de uma tool, algo que já **todas** as ferramentas anteriores
(`get_nutrition_history`, `propose_training_plan`, etc.) usavam. Não era um
bug desta funcionalidade — era latente em todo o loop de function-calling, e
só se tornou visível porque foi a primeira vez nesta sessão que o loop correu
sob a geração de modelo nova. Corrigido para `role: "user"`, que a API aceita.
Mesma classe de instabilidade que o comentário sobre `thinkingConfig` já
documentava para este alias.

### Verificado

52 testes Deno (`coach-chat`) + 166 Vitest, todos verdes. Testado ponta a
ponta no browser: liguei o toggle no Perfil, pedi ao Coach no chat para
ajustar a proteína para 165 g, confirmei a escrita na BD
(`protein_goal_set_by_coach=true`) e o selo "Coach" a aparecer no Perfil.
Dados de teste repostos (proteína, flags, mensagens do chat) depois da
verificação.

## 13. Doutrina em src/coach-knowledge/ (2026-08-11)

Converte `specs/coach-investigacao.md` (8 blocos, 73 perguntas) em ficheiros
consultáveis por assunto — `src/coach-knowledge/00-*.md` a `07-*.md`, mais
um `README.md` com o mapa de cobertura (o que já está wired em código vs. o
que ainda não). Gerado por script (não transcrito à mão) para garantir
fidelidade byte-a-byte com a investigação original — ver
`src/coach-knowledge/README.md` para a explicação de como cada Edge Function
usa isto (regras numéricas viram constantes TS duplicadas, nunca importadas
diretamente — cada função só empacota a sua própria pasta).

**Fechado o gap que ficou por resolver no §9**: o campo `meal_suggestion`
(no plano, no resumo diário, no comentário de refeições) passa a citar a
doutrina do Bloco 7 em vez do conhecimento geral do Gemini — distribuição de
macros por refeição, equivalência proteína/alimento do INSA/PortFIR, comida
pré-prova, e a instrução explícita de somar os alimentos em vez de copiar
ementas de exemplo (a mesma imprecisão que a própria investigação apontou na
resposta original).

Verificado com um pedido real no chat ("que comer antes/depois do longão de
sábado") — a resposta citou os alimentos exatos da doutrina (pão branco/mel,
aveia+banana, skyr, arroz/massa/batata-doce), não sugestões genéricas.
71 testes Deno (coach-chat) + 166 Vitest, todos verdes. Três funções
reimplantadas (`coach-chat`, `coach-daily-summary`, `analyze-meal`).

**Por fazer, documentado no README da doutrina**: só o Bloco 7 e parte do
Bloco 0/2.3 estão de facto wired em código. Os restantes (progressão de
carga, RED-S automático, doutrina de ginásio, hierarquia de alarmes
centralizada) continuam só como referência de leitura — a investigação está
completa, a implementação não.
