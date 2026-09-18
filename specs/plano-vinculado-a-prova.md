# Spec — O plano é para uma prova

**Estado:** proposta, 2026-09-18. Origem: falha encontrada pelo utilizador —
o plano de treino nunca ficou vinculado à prova que o motiva.
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
   lesão) continua a ser possível, mas só quando não há prova agendada
   dentro do período.
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
  `(period_start, period_end)`. Se houver: erro que diz qual é e as duas
  saídas (passar a `b` com `update_race_event`, ou plano até ela com
  `race_id` dela). É este erro que obriga a Carol a resolver com o atleta
  antes de propor.
- `race_id` ausente → nenhuma prova agendada em `[period_start, period_end]`
  (senão o plano tinha uma prova que não é o objetivo; erro: "há a prova X
  no período — é plano para ela? passa race_id").
- A validação atual da prova no dia/véspera mantém-se e passa a valer para
  todas as provas do período (a objetivo e as `b`/`c` intermédias).

`replace_active_plan` mantém a semântica: a substituição só acontece na
aceitação (`supersedes_plan_id`).

### 4.2. `planDivergence.js` (cliente) — deteção

Só planos `aceite` com `period_end ≥ hoje`, como agora. Motivos novos, por
ordem de gravidade:

| chave | quando | como aparece |
|---|---|---|
| `race_conflict_a` | prova `a` com data em `(period_start, period_end)`, `id ≠ plan.race_id`, `conflict_acknowledged_at` null | **intervenção** — mesmo tratamento que `coach_intervention_status = 'needed'`: "precisa de falar contigo", sem dispensar, `coachIntent { kind: 'race_conflict', race, plan }` |
| `race_added` | prova `b`/`c` no período sem item `training_type = 'prova'`, `conflict_acknowledged_at` null | divergência (dispensável), substitui o motivo atual "prova no período sem item" |
| `plan_lost_race` | plano com `race_id` null mas que tinha (a prova foi apagada) — na prática: plano cujo `period_end` já não coincide com prova nenhuma | divergência |

`race_conflict_a` não passa pelo `wasDivergenceHandled` (localStorage) — a
persistência é o `conflict_acknowledged_at` na BD, que a Carol escreve
quando o atleta decide. É a diferença entre "já te disse" (dispensável) e
"ainda não decidiste" (volta sempre).

O cliente já sabe tudo o que precisa (`raceEvents`, `coachPlans` no
store); sem chamada nova.

### 4.3. Trigger em `race_events` — a data da prova mudou

`after update of date, race_priority on race_events`:

- Se `date` mudou e há `coach_plans` com `race_id = new.id` e
  `status in ('proposto','aceite')`: `period_end = new.date`. Os itens
  fora do período novo (prova adiada para mais cedo) ficam `cancelado`
  com nota; a Carol vê a divergência "o plano encurtou" na próxima
  conversa (motivo `plan_trimmed`, §4.2 — a acrescentar à tabela).
- Se `date` ou `race_priority` mudaram: `conflict_acknowledged_at = null`.

Alternativa sem trigger — o cliente deteta `period_end ≠ race.date` como
divergência e a Carol reescreve. Mais simples, mas deixa o plano errado
até alguém abrir a app. Preferência: trigger, porque `period_end` é a
única coisa que o cliente lê para saber se o plano está ativo.

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
- `coachIntent` `adapt_plan` com motivo `race_added`: a Carol propõe o
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

## 5. Decisões tomadas nesta proposta (a confirmar)

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
| `Home.jsx` | `race_conflict_a` → canal da intervenção, não da divergência |
| `Coach.jsx` | intent `race_conflict` |
| `coach-knowledge/02-corrida-prova.md` | doutrina §4.5 |
| `plano-de-treino.md` §3.1 | acrescentar `race_id`; §8 fecha a questão 4 parcialmente (o objetivo duradouro da época é a prova) |
| `plano-de-prova.md` | "O plano tem de saber da prova" ganha a referência a esta spec |
| `RunAgenda.jsx` | ao gravar uma prova `a` com plano ativo para outra: aviso inline "vai entrar em conflito com o plano; a Carol vai querer falar" — informativo, não bloqueia |
| testes | Deno: as validações de §4.1; Vitest: §4.2 e o intent no Home/Coach |

Ordem sugerida: migration + `propose_training_plan` (é o que impõe a
regra) → deteção no cliente → conversa (intents, doutrina) → aviso no
formulário da prova.
