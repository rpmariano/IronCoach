# Spec — O plano é para uma prova

**Estado:** implementado, 2026-09-18 (decisões de §5 confirmadas). Origem:
falha encontrada pelo utilizador — o plano de treino nunca ficou vinculado à
prova que o motiva. Revisto no mesmo dia depois da revisão pré-deploy: §4.1,
§4.2, §4.3 e a §4.6 nova descrevem o que ficou, não a primeira proposta.
Complementa `plano-de-treino.md` (o acordo) e `plano-de-prova.md` (o dia
da prova dentro do plano). Onde esta spec contradiz as outras duas, esta
manda; as alterações a fazer lá estão em §7.

## 1. O problema

O grande objetivo da app é um plano que leva o atleta a uma prova. Mas
`coach_plans` tem só `period_start`/`period_end` — não sabe para que prova
é. Consequências, todas verificadas no código a 2026-09-18:

- Um plano pode acabar antes ou depois da prova; nada obriga o último dia a
  ser o dia dela. `runProposeTrainingPlan` só garante que, *se* uma prova
  cair no período, o dia dela é a prova e a véspera é leve.
- Duas provas principais (`race_priority = 'a'`) podem coexistir no mesmo
  horizonte sem ninguém reparar. O taper de cada uma (10-21 dias) é
  incompatível com treinar para a outra.
- Uma prova criada depois de o plano existir só aparece como "prova no
  período sem item de prova" (`planDivergence.js`), um aviso dispensável, e
  igual para uma principal nova e para uma de treino.
- Depois da prova, o plano não termina — arrasta-se até ao `period_end`
  que a Carol tiver escolhido.

## 2. Regras

1. **Um plano tem uma prova-objetivo.** `coach_plans.race_id` aponta para
   ela. O `period_end` do plano **é** a data da prova; nesse dia o plano
   termina. Um plano sem prova (`race_id` null — base aeróbica, regresso de
   lesão) continua a ser possível, mas só quando não há prova **principal**
   agendada dentro do período — as secundárias e de treino podem estar lá,
   são treino (§4.1).
2. **O atleta pede plano quando quiser.** Cada pedido para uma prova cria
   um plano de raiz para esse objetivo. A Carol tem no contexto o plano
   anterior, o balanço da prova anterior (`race_after`) e o histórico — o
   plano novo parte daí, não de zero, mas é um registo novo.
3. **Entre hoje e a prova-objetivo só há uma principal.** As provas
   intermédias têm de ser secundárias (`b`) ou de treino (`c`): entram no
   plano como treino de qualidade — a Carol trata-as como o atleta as
   marcou. Se houver outra principal intermédia, a Carol **não avança** sem
   uma de duas coisas: o atleta passa a intermédia a secundária (a Carol
   oferece-se para o fazer, via `update_race_event`), ou o plano passa a
   preparar até essa prova, que fica o objetivo. O servidor impõe isto —
   não é só uma instrução ao modelo.
4. **Prova nova depois do plano existir, dentro do período:**
   - **Principal nova** → conflito. A Carol pede conversa urgente pelo
     mesmo canal da intervenção (botão flutuante do Início, "precisa de
     falar contigo", não dispensável) até ficar resolvido. No chat, o
     discurso é o mesmo: ou a nova passa a secundária e a Carol propõe o
     ajuste do plano para a incluir, ou o plano passa a ter a nova como
     objetivo (plano novo que substitui o atual, a acabar no dia dela).
   - **Secundária ou de treino nova** → a Carol pede para falar e tenta
     convencer o atleta a pedir o ajuste do plano para a integrar. É um
     aviso, não um bloqueio: o atleta pode dispensá-lo.
5. **A Carol tenta, não impõe.** No fim fica como o atleta quiser — o
   objetivo é garantir que decide informado. Uma decisão tomada não volta a
   ser pedida: "manter as duas como principais" é uma resposta válida, fica
   registada, e a Carol não chateia mais por causa dessa prova.

## 3. Modelo de dados

### `coach_plans`

```
race_id   uuid null → race_events(id) on delete set null
```

- Quando preenchido, `period_end = race_events.date` (constraint por
  trigger, não por check — a data da prova pode ser editada; ver §4.3).
- `on delete set null`: apagar a prova não apaga o plano — passa a plano
  sem objetivo, e o cliente avisa (é uma divergência nova, §4.2).

```
race_lost_at   timestamptz null
check (period_end >= period_start)     -- coach_plans_period_order
```

- `race_lost_at` é o que distingue um plano que **perdeu** a prova (apagada,
  ou passada para antes do início do plano) de um plano de base que nunca a
  teve — com `race_id` null, os dois eram indistinguíveis. Escrito pelos
  triggers de §4.3 no momento em que acontece.
- A restrição de ordem do período não existia: um caminho que a partisse
  fazia o plano desaparecer do cliente sem aviso (§4.3).

### `race_events`

```
conflict_acknowledged_at   timestamptz null
```

O atleta decidiu conscientemente manter esta prova como está apesar do
conflito com o plano ativo (§2.5). Preenchido pela Carol
(`update_race_event`) quando o atleta diz que fica assim. A deteção de
conflito (§4.2) ignora provas com isto preenchido. Volta a null se a
prioridade ou a data mudarem depois (trigger) — uma decisão sobre a prova
de dia 12 como secundária não vale para a mesma prova mudada para dia 20.

Sem tabela nova. `supersedes_plan_id` já cobre "plano novo que substitui o
atual".

## 4. Onde cada regra vive

### 4.1. `propose_training_plan` (coach-chat) — o servidor impõe

Parâmetro novo `race_id` (opcional). Validação, antes de gravar:

- `race_id` dado → a prova existe, é do atleta, `status ≠ concluida`,
  `date ≥ hoje`; **`period_end` tem de ser a data dela** (erro claro ao
  modelo: "o plano para a prova X acaba no dia dela, YYYY-MM-DD").
- `race_id` dado → **nenhuma outra prova `a`** com data em
  `[period_start, period_end]` — intervalo **fechado**, o mesmo no servidor
  e no cliente: uma segunda principal no próprio dia do objetivo também é
  conflito. Se houver: erro que diz qual é e as duas saídas (passar a `b`
  com `update_race_event`, ou plano até ela com `race_id` dela). É este erro
  que obriga a Carol a resolver com o atleta antes de propor.
- `race_id` ausente → nenhuma prova **`a`** agendada no período (senão o
  plano atravessava um objetivo sem o assumir; o erro traz o id dela). As
  `b`/`c` **passam**: um bloco de base pode atravessar uma prova de treino,
  e é assim que o atleta as quer. A primeira versão recusava qualquer prova
  no período, e quem tinha só uma prova de treino à frente ficava sem saída
  nenhuma — omitir o `race_id` era recusado, passá-lo forçava o plano a
  acabar no dia de uma prova que não é objetivo de nada.
- `replace_active_plan` sobre um plano **vinculado** sem passar `race_id` →
  recusado, com o `race_id` e o `period_end` certos na mensagem. Na
  aceitação isso fecharia o bloco da prova (§4.6) sem ninguém dar por isso.
- O `id` de cada prova vai no contexto (`buildRaceEventsContext`, `id: …`) e
  o vínculo do plano ativo também (`buildPlanContext`). A primeira versão
  pedia `race_id` ao modelo sem nunca lho mostrar, e a saída mais barata dele
  era encurtar o `period_end` até a prova sair do período.
- A validação atual da prova no dia/véspera mantém-se e passa a valer para
  todas as provas do período (a objetivo e as `b`/`c` intermédias).

`replace_active_plan` mantém a semântica: a substituição só acontece na
aceitação (`supersedes_plan_id`).

### 4.2. `planDivergence.js` (cliente) — deteção

Só planos `aceite` com `period_end ≥ hoje`, como agora. Motivos novos, por
ordem de gravidade:

| chave | quando | como aparece |
|---|---|---|
| `detectRaceConflict` (não é um motivo, é um canal) | prova `a` com data em `[period_start, period_end]`, a partir de hoje, `id ≠ plan.race_id`, `conflict_acknowledged_at` null | **intervenção** — "precisa de falar contigo", sem dispensar, `coachIntent { kind: 'race_conflict', races, target }` |
| `prova_sem_item` | prova no período (incluindo `b`/`c`) sem item de prova, `conflict_acknowledged_at` null | divergência (dispensável) — já existia, e cobre a prova secundária nova |
| `plano_sem_prova` | plano com `race_id` null **e** `race_lost_at` preenchido | divergência |

`plano_sem_prova` lê-se de `race_lost_at` (§3) e não da ausência da prova:
a FK é `on delete set null`, por isso depois de apagar a prova o `race_id`
já é null — o mesmo estado de um plano de base que nunca teve prova. A
primeira versão procurava um `race_id` sem prova na agenda, estado que a BD
não consegue produzir; o aviso nunca disparava.

O conflito não passa pelo `wasDivergenceHandled` (localStorage) — a
persistência é o `conflict_acknowledged_at` na BD, que a Carol escreve
quando o atleta decide. É a diferença entre "já te disse" (dispensável) e
"ainda não decidiste" (volta sempre).

O cliente já sabe tudo o que precisa (`raceEvents`, `coachPlans` no
store); sem chamada nova.

### 4.3. Triggers em `race_events` — a prova mudou ou foi apagada

`before update of date, race_priority` (`sync_plan_end_to_race_date`):

- A prova passou para **antes do início** do plano: o plano já não a
  contém. Não se encurta — daria `period_end < period_start`, que fazia o
  plano desaparecer do cliente com todos os itens cancelados. O plano
  aceite **perde a prova** (`race_id = null`, `race_lost_at = now()`) com os
  itens intactos; uma proposta ainda por decidir passa a `recusado`.
- Caso normal (a prova continua dentro): `period_end = new.date`, e os
  itens pendentes para lá dela ficam `cancelado` com nota.
- Se `date` ou `race_priority` mudaram: `conflict_acknowledged_at = null`.

`before delete` (`mark_plan_race_lost`): marca `race_lost_at` nos planos
aceites da prova **antes** de a FK pôr o `race_id` a null — depois já não
havia por onde os encontrar. Propostas dessa prova passam a `recusado`.

A invariante `check (period_end >= period_start)` fica na tabela
(`coach_plans_period_order`), para nenhum outro caminho a poder partir.
Tudo isto foi testado em produção num bloco que abortava no fim — ver o
cabeçalho da migration `20260918074705_plan_race_lost.sql`.

Ficou por fazer: um aviso próprio para "o plano encurtou" (`plan_trimmed`).
Hoje o rasto é só a nota nos itens cancelados; o plano continua visível e a
acabar no dia da prova, o que é o essencial.

Alternativa sem trigger — o cliente deteta `period_end ≠ race.date` como
divergência e a Carol reescreve. Mais simples, mas deixa o plano errado
até alguém abrir a app. Preferência: trigger, porque `period_end` é a
única coisa que o cliente lê para saber se o plano está ativo.

### 4.6. Aceitar uma proposta — ajuste ou bloco novo

`respondToPlan` (`src/store/index.js`) decide com `planAcceptanceMode`
(`src/utils/planAcceptance.js`), quando a proposta se sobrepõe a um plano
aceite:

- **Mesmo objetivo** (mesmo `race_id`, ou nenhum dos dois com prova):
  ajuste. Funde no plano original — mantém o id, o histórico e o vínculo.
- **Objetivo novo** (outro `race_id`, ou passar a ter, ou deixar de ter):
  plano novo de raiz, como pedido — o bloco antigo fecha na véspera do novo
  (`closeOldBlock`), os treinos dele a partir desse dia cancelam-se, e o
  novo é aceite como plano próprio. Se o antigo nem chegou a começar antes
  do novo, sai como `recusado`.
- **Planos só de refeições** (`save_meal_suggestions`, dias de `descanso`)
  nunca abrem nem fecham um bloco: fundem, como antes.

A primeira versão fundia tudo e ignorava o `race_id` da proposta. Resolver
um conflito de principais pela segunda saída ("o plano passa a preparar a
intermédia") não mudava nada: ficava o `race_id` antigo e o fim no dia da
prova mais distante, o conflito continuava lá e a Carol voltava a pedir a
mesma conversa.

### 4.4. coach-chat — o que a Carol sabe e diz

- `buildRaceEventsContext` passa a dizer, por prova, se é a objetivo do
  plano ativo e se há conflito de principais, com a data de cada.
- Contexto do plano ativo passa a incluir a prova-objetivo por nome e data.
- `coachIntent` novo `race_conflict` (Coach.jsx): mensagem automática de
  abertura com a prova nova, a prova-objetivo, e as duas saídas. O modelo
  usa `update_race_event` (prioridade) ou `propose_training_plan`
  (`race_id` novo + `replace_active_plan`) conforme o atleta escolher; se
  o atleta quiser manter as duas, `update_race_event` com
  `conflict_acknowledged: true`.
- `coachIntent` `adapt_plan` com motivo `prova_sem_item`: a Carol propõe o
  plano ajustado com a prova como treino de qualidade; se o atleta não
  quiser, dispensa e fica.
- Depois da prova-objetivo (`race_after`, já existe): a Carol fecha o
  ciclo e pergunta qual é a próxima. Sem plano ativo, o Início mostra o
  estado "sem plano" (já existe para o primeiro dia; reutilizar).

### 4.5. Doutrina

`src/coach-knowledge/02-corrida-prova.md` ganha o bloco "uma principal de
cada vez" com a regra e as duas saídas, para o modelo o ter como doutrina
e não só como erro de ferramenta. A regra de taper por prioridade
(Corrida 2.3 #1) já existe e é o fundamento.

## 5. Decisões tomadas nesta proposta (confirmadas 2026-09-18)

1. **`c` (treino) trata-se como `b`** para efeitos de enquadramento — a
   descrição só falava em principal/secundária. Uma prova de treino é, por
   definição, parte do treino.
2. **Plano sem prova continua a existir** (`race_id` null), mas nunca com
   uma prova agendada dentro dele. A descrição não o proibia; proibir
   tirava o plano de base a quem ainda não tem prova.
3. **O plano cobre até à prova, mas os itens podem entrar por tranches.**
   Hoje `MAX_PLAN_ITEMS` limita a proposta; um plano de 20 semanas não cabe
   numa. O registo `coach_plans` vai de hoje à prova; a Carol escreve os
   itens das próximas semanas e ajusta (o mecanismo de ajuste que já
   escreve itens no plano original serve). Alternativa: subir
   `MAX_PLAN_ITEMS` e propor tudo de uma vez — pior para o atleta e para o
   modelo.
4. **"Manter as duas principais" é uma decisão válida e durável**
   (`conflict_acknowledged_at`), não uma dispensa local. A descrição diz
   "no final deve ficar como o atleta desejar" — isto é o que o torna
   verdade sem a Carol voltar a insistir na mesma prova.
5. **A prova nova `b` é dispensável; a `a` não.** A descrição pede
   "urgente" e "até resolver" só para a principal; para a secundária pede
   "tentar convencer". A diferença está em §4.2.

## 6. Fora de âmbito

- Mais do que um plano ativo em simultâneo (ex.: plano de ginásio
  independente do de corrida). Continua a haver um.
- Provas de outra modalidade (ciclismo, natação).
- A Carol propor uma prova ao atleta.

## 7. Alterações a fazer

| onde | o quê |
|---|---|
| migration | `coach_plans.race_id`, `race_events.conflict_acknowledged_at`, trigger §4.3 |
| `coach-chat/index.ts` | `propose_training_plan`: `race_id` + validações §4.1; `update_race_event`: `conflict_acknowledged`; contexto §4.4; intent `race_conflict` |
| `planDivergence.js` (+ teste) | motivos §4.2 |
| `Home.jsx` | `detectRaceConflict` → canal da intervenção, não da divergência |
| `Coach.jsx` | intent `race_conflict` |
| `coach-knowledge/02-corrida-prova.md` | doutrina §4.5 |
| `plano-de-treino.md` §3.1 | acrescentar `race_id`; §8 fecha a questão 4 parcialmente (o objetivo duradouro da época é a prova) |
| `plano-de-prova.md` | "O plano tem de saber da prova" ganha a referência a esta spec |
| `RunAgenda.jsx` | ao gravar uma prova `a` com plano ativo para outra: aviso inline "vai entrar em conflito com o plano; a Carol vai querer falar" — informativo, não bloqueia |
| testes | Deno: as validações de §4.1; Vitest: §4.2 e o intent no Home/Coach |

Ordem sugerida: migration + `propose_training_plan` (é o que impõe a
regra) → deteção no cliente → conversa (intents, doutrina) → aviso no
formulário da prova.
