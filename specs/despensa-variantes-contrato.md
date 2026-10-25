# Despensa: alimento genérico com variantes — contrato (bug #87)

> Coordenador, 2026-10-25. Decisão do Rui. Fonte de verdade para Backend e Frontend; mudanças passam pelo coordenador.

## Problema

A despensa guardou «coxa de frango com pele». Quando o atleta come a coxa sem pele, nada lhe pergunta, e os valores ficam os da coxa com pele.

## Decisão do Rui

1. Guarda-se o **alimento genérico** («coxa de frango»).
2. As **variantes** («com pele», «sem pele») ficam na base de dados, cada uma com os seus valores por 100 g.
3. **Pergunta-se sempre** qual foi a variante, sempre que o genérico aparece numa refeição.
4. A pergunta e os valores vêm da base de dados: **sem chamada à API** (Gemini) para isto.

## Base de dados (Backend)

Em `athlete_foods`:

| coluna | tipo | notas |
|---|---|---|
| `parent_id` | uuid null → `athlete_foods(id)` on delete cascade | preenchida nas variantes; `null` no genérico e nos alimentos normais |
| `variant_label` | text null, 1-40 chars | «com pele», «sem pele»; obrigatório quando `parent_id` não é null |

- Check: `(parent_id is null) = (variant_label is null)`.
- Uma variante tem o mesmo `user_id` do pai (validar no trigger ou nas escritas do servidor).
- `name` / `name_key` da variante: «coxa de frango com pele» (genérico + rótulo), único por `user_id` como hoje.
- O genérico tem também valores por 100 g, os de uma variante por omissão (a mais comum), para os ecrãs que não sabem de variantes.
- Um genérico com variantes = uma linha com pelo menos uma filha. Um alimento sem filhas comporta-se como hoje.
- A RLS existente («own rows») cobre as colunas novas.

Migration nova; aplicada à mão pelo coordenador depois do OK do Rui, **antes** do push que leva o código que a usa.

## Servidor: `analyze-meal` (Backend)

- Quando o Gemini identifica um alimento com uma qualificação que muda os valores (pele, gordura da carne, leite gordo/magro, com/sem açúcar…), o servidor grava-o como **genérico + variante**: o genérico (sem a qualificação) e a variante filha. Pedir ao modelo que devolva, por item, `generic_name` e `variant` (ou `null`).
- Se o genérico já existir na despensa com variantes, o servidor **gera ele próprio** a pergunta da Carol a partir das variantes guardadas (sem pedir ao Gemini), no mesmo formato de `carol_questions`: pergunta curta («A coxa era com pele ou sem pele?»), opções = os `variant_label`, `assumed` = a variante mais usada.
- Esta pergunta **faz-se sempre** que o genérico aparece, mesmo que a regra em `athlete_food_rules` esteja `confirmado`. Não conta para o limite de 5 perguntas do Gemini.
- Quando o atleta responde, os valores do item passam a ser os da variante escolhida (vindos da base de dados, sem nova análise).
- Uma variante nova que o atleta indique («sem pele» quando só havia «com pele»), e que ainda não tenha valores, é a única situação em que se pede valores ao modelo.
- As perguntas geradas assim seguem a regra de respondibilidade do #86.

## App (Frontend)

- **Registo manual / sugestões** (`MealRegistration`, `pantrySuggestions`, predefinidas): escolher um genérico com variantes abre logo a escolha da variante (chips com os `variant_label`), sem chamada à API. O item fica com o nome e os valores da variante.
- **Armário** (`src/components/Pantry`): o genérico mostra as variantes por baixo; dá para editar os valores de cada uma, acrescentar ou apagar uma variante.
- Modo demo: mock com um genérico com duas variantes.

## Ordem

1. Backend: migration (não aplicada), alterações ao `analyze-meal` e `pantryFromChat` e testes. O Backend define os nomes exatos dos campos do JSON do modelo.
2. Frontend: em paralelo, contra este contrato.
3. Coordenador: OK do Rui à migration, aplicação, integração, push.
4. Dados existentes: o Backend propõe (sem executar) como converter as linhas atuais com qualificação («… com pele») em genérico + variante.
