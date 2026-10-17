# Carol: quantidades, hábitos e refeições predefinidas (bugs #58, #66, #63)

Estado: **aprovada** a 2026-10-17 (todas as decisões da §7 aceites tal como propostas). Escrita a 2026-10-17 a partir dos bugs abertos e
Feito: fase A (044bdf4d) e fase B (perguntas de quantidade, resposta sem Gemini, comentario sem criticar o assumido).
do código atual (`analyze-meal/pantry.ts`, `analyze-meal/index.ts`,
`CarolQuestions.jsx`, `PantrySection.jsx`, migration `20261003233613_athlete_pantry.sql`).

## 1. O que foi pedido

- **#58 (2026-10-07):** numa foto de sandes a Carol assumiu 10 g de manteiga e 40 g de
  fiambre de peru. Na foto viam-se 3 fatias finas e manteiga em camada fina. Pedido:
  - Perguntar a quantidade, como já pergunta a preparação. Manteiga: camada fina, só de
    um lado ou dos dois, camada grossa. Fiambre: fatias finíssimas, finas, médias ou grossas.
  - Acumular as respostas: ao fim de respostas iguais, assume o hábito e deixa de perguntar.
    O mesmo vale para a forma de cozinhar (ex.: batatas fritas na air fryer).
  - Se numa refeição a observação contrariar o hábito (ex.: "fritas em óleo"), essa
    refeição usa a observação, o hábito deixa de valer e ela volta a perguntar da próxima vez.
- **#66 (2026-10-11):** «não deve fazer só uma pergunta, deve perguntar o que for
  necessário. Mais vale ir perguntando do que assumir coisas completamente erradas.»
- **#63 (2026-10-09):** no Armário, uma categoria onde se juntam ingredientes para criar
  refeições predefinidas.

## 2. O que já existe (não refazer)

| Peça | Onde | Faz |
|---|---|---|
| Perguntas da Carol | `parseQuestions` (pantry.ts), `QUESTIONS_RULE` (index.ts), `CarolQuestions.jsx` | Até **2** perguntas, só se mudam **≥ 50 kcal**, só sobre **preparação/tempero**. A refeição grava-se com a opção `assumed`; responder reestima os itens e regenera o comentário (`mode: "answer"`). |
| Hábitos | `athlete_food_rules` + `nextRuleRow` | Tema → valor. 1 vez = `por_confirmar`; **2 iguais = `confirmado`** (deixa de perguntar). Um valor diferente sobre um confirmado passa a `varia`: volta a perguntar e só reconfirma com 3 iguais. `manual` = só o atleta muda. |
| Observações → hábitos | `cookingFactsRule`, `learnFromMeal` | O que as observações dizem **explicitamente** sobre preparação vira facto e soma às regras. |
| Perguntas em aberto sobre alimentos da despensa | `pendingRulesFor` | Um alimento conhecido com uma regra por confirmar ou que varia volta a passar pelo modelo. |
| Despensa | `athlete_foods`, `PantrySection.jsx` | Alimentos com valores por 100 g e porção habitual; separadores "Alimentos" e "Como cozinhas". Escrever um alimento completo da despensa regista-o sem Gemini (`splitKnownWritten`). |

Ou seja, a mecânica de hábitos que o #58 pede (aprender, deixar de perguntar, a exceção
anular o hábito e voltar a perguntar) **já existe para a preparação**. Falta estendê-la
às **quantidades** e tirar os limites que o #66 critica.

## 3. O que falta

1. **Não há perguntas de quantidade.** `QUESTIONS_RULE` só fala de preparação.
2. **O limiar de 50 kcal tapa as quantidades que importam.** 40 g contra 25 g de fiambre
   de peru são ~17 kcal mas 3,5 g de proteína, e a proteína é o que a Carol depois critica
   (foi o "O que corrigir" do #58).
3. **Máximo de 2 perguntas** (#66). O texto da UI também está preso a "uma"/"duas" perguntas.
4. **As observações só geram factos de preparação.** "Pouca manteiga" ou "3 fatias de
   fiambre" não ficam como hábito.
5. **O comentário critica o que ela assumiu.** No #58 escreveu "corta os 10 g de manteiga"
   sobre um valor que estava a perguntar. Hoje o comentário só se corrige depois de
   responder; até lá dá conselho sobre um número inventado.
6. **Não há refeições predefinidas** (#63).

## 4. Proposta — #58 + #66 (perguntas e hábitos)

### 4.1 Dois tipos de pergunta

`CarolQuestion` ganha `kind: "preparacao" | "quantidade"` (omissão `preparacao`, para as
perguntas já gravadas).

- **Quantidade:** opções descritivas **com o equivalente em gramas**, para o atleta ver
  o que está a escolher e a reestimativa ser determinística. Ex.: manteiga → "Camada fina,
  um lado (~5 g)", "Camada fina, dois lados (~10 g)", "Camada grossa (~15 g)"; fiambre →
  "3 fatias finíssimas (~25 g)", "3 fatias finas (~35 g)", "3 fatias médias (~50 g)".
- O modelo propõe as opções; o servidor valida que cada opção de quantidade traz gramas
  (`~N g`). Sem gramas, a pergunta cai.
- Responder a uma pergunta de quantidade **troca o `quantity_grams` do item e recalcula**
  pelos valores por 100 g já estimados, sem nova chamada ao Gemini. As de preparação
  continuam a reestimar como hoje.

### 4.2 Quando perguntar

- Pergunta-se se a resposta muda **≥ 40 kcal ou ≥ 4 g de proteína** no item. O modelo passa
  a devolver `impact_protein_g` além de `impact_kcal`.
- **Máximo 5** por refeição (era 2), ordenadas por impacto. Na dúvida continua a não
  perguntar, mas "não sei a quantidade de algo que se vê mal na foto" passa a ser motivo.
- Nunca sobre um tema `confirmado`, nem sobre o que as observações desta refeição já dizem.
  Itens com quantidade explícita (escrita pelo atleta, ou de uma refeição predefinida, §5)
  não levam pergunta de quantidade.
- UI: o texto passa a contar as perguntas ("três perguntas"…), mostra o total por kcal e
  por proteína, e permite responder só a algumas (as restantes ficam no cartão, como o
  "Agora não" de hoje).

### 4.3 Hábitos de quantidade

Reutiliza `athlete_food_rules`, sem tabela nova. O tema de quantidade é
`"<alimento> · quantidade"` (ex.: `manteiga · quantidade` → `camada fina, um lado (~5 g)`).

- As mesmas regras de `nextRuleRow`: 2 respostas iguais = confirmado; uma diferente sobre
  um confirmado = `varia` (volta a perguntar, reconfirma com 3).
- Um hábito confirmado entra no conhecimento enviado ao modelo
  ("Como cozinha e tempera" passa a "Como cozinha, tempera e serve") como valor por omissão.
- O separador "Como cozinhas" da Despensa mostra também os hábitos de quantidade, e o
  atleta pode editá-los (`source: manual`), como já faz com os de preparação.

### 4.4 A observação manda (a exceção do #58)

- `cookingFactsRule` passa a extrair também quantidades explícitas ("pouca manteiga",
  "3 fatias de fiambre", "fritas em óleo").
- O prompt diz explicitamente que **a observação desta refeição tem prioridade sobre
  qualquer hábito guardado**. Hoje está implícito; passa a regra.
- O facto contrário segue o caminho atual: confirmado → `varia` → volta a perguntar. É
  exatamente o pedido ("anular a predefinição, assumir o comentário e da próxima vez
  voltar a perguntar").

### 4.5 O comentário não critica o que está por confirmar

- Com perguntas em aberto, o prompt do comentário recebe a lista dos valores assumidos,
  marcados "por confirmar". Não pode criticar nem mandar cortar uma quantidade assumida;
  pode dizer "assumi ~10 g de manteiga". A versão definitiva já sai depois das respostas
  (regeneração atual).

## 5. Proposta — #63 (refeições predefinidas)

### 5.1 Dados

Tabela nova `athlete_meal_templates` (RLS "own rows", como `athlete_foods`):

| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk auth.users | cascade |
| name | text | "Pequeno-almoço de treino" |
| name_key | text | `foodKey`, unique por atleta |
| default_meal_type | text null | sugere o tipo ao usar |
| items | jsonb | `[{ food_id, name, grams }]` — `food_id` aponta para `athlete_foods` |
| times_used | int | ordena a lista |
| last_used_at, created_at, updated_at | timestamptz | |

A migration **tem de ser aplicada à mão antes do push a `dev`** (o workflow só faz deploy
das funções; ver memória "Migrations não são deployadas").

### 5.2 Armário

- A Despensa ganha um terceiro separador: **Refeições · N**.
- Criar: nome, tipo sugerido (opcional) e alimentos escolhidos da despensa (pesquisa já
  existente), cada um com gramas. Por omissão, a porção habitual.
- Editar, apagar e ver o total (kcal e macros) calculado pelos valores da despensa.

### 5.3 Registar uma refeição a partir de uma predefinida

- No registo de refeição, uma linha "As tuas refeições" (as mais usadas primeiro). Tocar
  preenche a lista de alimentos, que continua editável (tirar um, mudar gramas, juntar outro).
- Se todos os alimentos forem completos da despensa, o registo é feito **sem Gemini para
  os itens** (`splitKnownWritten` já o faz) e só o comentário da Carol vai ao modelo:
  rápido e sem estimativas.
- Quantidades explícitas: não há perguntas de quantidade sobre esses itens (§4.2).
- **Fase 2 (opcional):** "Guardar como refeição" no cartão de uma refeição registada.

## 6. Fases e esforço

| Fase | Conteúdo | Toca | Modelo / esforço |
|---|---|---|---|
| A | §4.2 limites (5 perguntas, kcal ou proteína) + UI com contagem | pantry.ts, index.ts, CarolQuestions.jsx | Opus 5.5 / high |
| B | §4.1 perguntas de quantidade + reestimativa por gramas + §4.5 comentário | index.ts, pantry.ts, CarolQuestions.jsx | Fable 5.1 / xhigh |
| C | §4.3–4.4 hábitos de quantidade e observação com prioridade + "Como cozinhas" | pantry.ts, FoodRuleSheet, PantrySection | Opus 5.5 / high |
| D | §5 refeições predefinidas (migration, Armário, registo) | migration, Pantry*, MealRegistration | Opus 5.5 / high |

As fases A–C tocam a Edge Function `analyze-meal`: cada push a `dev` é deploy em produção.
Testar com `deno test` (com `DENO_DIR` novo) e `vitest` antes de cada um. A D é sobretudo
frontend, mais uma migration.

## 7. Decisões (aceites a 2026-10-17)

1. **Máximo de perguntas:** 5? (o #66 diz "o que for necessário"; um teto evita um
   questionário a cada refeição).
2. **Limiares:** ≥ 40 kcal **ou** ≥ 4 g de proteína — ok?
3. **Gramas nas opções** ("Camada fina (~5 g)"): mostrar, ou só a descrição?
4. **Momento:** manter "grava com o assumido e pergunta a seguir" (atual), ou perguntar
   **antes** de gravar quando há perguntas de quantidade?
5. **#63:** entra já o "Guardar como refeição" a partir de uma refeição registada, ou fica
   para a fase 2?
