-- ============================================================================
-- Micronutrientes podem ficar por saber (D6 da Evolução, 2026-10-05)
-- POR APLICAR — só o ficheiro. Aplica-se com autorização do dono, ANTES do
-- deploy da analyze-meal que grava null (ver "Ordem de deploy" abaixo).
-- ============================================================================
--
-- specs/evolucao-2026-10/plano.md, D6: «mostrar cobertura ("dado em X% dos
-- alimentos") exige gravar null quando o valor falta (hoje grava 0)». Até
-- aqui a analyze-meal convertia em 0 qualquer valor que o modelo não desse,
-- e fibra/açúcar/sódio eram NOT NULL DEFAULT 0 — um 0 tanto queria dizer "não
-- tem" como "não sei". Com isto a app passa a poder dizer "Ferro pelo menos
-- 13 mg/dia · dado em 54% dos alimentos".
--
-- O que muda, só em meal_items (a tabela onde a analyze-meal grava os itens):
--   · As sete colunas de micronutrientes (fiber/sugar/sodium_per_100g e
--     iron_mg/calcium_mg/vitamin_c_mg/potassium_mg_per_100g) ficam numeric
--     nulável sem DEFAULT.
--   · fibra/açúcar/sódio eram NOT NULL DEFAULT 0 (supabase_schema.sql).
--   · ferro/cálcio/vitamina C/potássio estão documentados como nuláveis sem
--     default, MAS nenhuma migração deste repositório os cria (revisão de
--     2026-10-05: grep iron_mg_per_100g em supabase/migrations só encontra
--     athlete_foods, onde são NOT NULL DEFAULT 0). O estado real em produção
--     não está garantido pelo repositório, e o código antigo gravava sempre
--     0 — um NOT NULL nessas colunas nunca se teria visto. Por isso o ALTER
--     inclui-as também: em Postgres, DROP NOT NULL numa coluna já nulável e
--     DROP DEFAULT numa coluna sem default não fazem nada (sem erro), e assim
--     o insert com null da analyze-meal nova não depende de estado não
--     documentado.
--   · Calorias e macros (calories/protein/carbs/fat_per_100g) NÃO mudam:
--     continuam NOT NULL DEFAULT 0.
--
-- Porquê tirar o DEFAULT em vez de o manter: hoje o único escritor de
-- meal_items é a analyze-meal (a app nunca insere itens diretamente), e
-- tanto a versão antiga como a nova escrevem SEMPRE as sete colunas
-- explicitamente (pickMealItem, analyze-meal/pantry.ts) — o default nunca se
-- usa. Se um escritor futuro omitir a coluna, "não disse" deve ficar null
-- ("não sei"), não um 0 que volta a ser ambíguo. Seguro com os dois códigos:
--   · código antigo + esta migração: grava 0 explícito, como sempre;
--   · código novo + esta migração: grava null quando o modelo não dá o valor;
--   · código novo SEM esta migração: o insert com null em fiber/sugar/sodium
--     (ou em qualquer outra das sete, se em produção for NOT NULL) FALHA
--     (violação de NOT NULL) e a refeição não se grava — daí a ordem.
--
-- Dados existentes: NÃO se tocam. Os zeros antigos são ambíguos (podem ser
-- "não tem" ou "não sei") e não há forma de os distinguir; convertê-los em
-- null apagaria os zeros verdadeiros (vitamina C no azeite, fibra no frango).
-- A app trata-os assim (_shared/formulas/nutritionPeriod.ts,
-- MICROS_NULL_SINCE): um período com alimentos gravados antes do deploy da
-- analyze-meal nova continua a dizer "São mínimos: alimentos sem esta
-- informação contam como zero."; a cobertura só aparece quando todos os
-- alimentos do período foram gravados depois. MICROS_NULL_SINCE fica null
-- (cobertura desligada) até se saber o instante real desse deploy.
--
-- Fora daqui, de propósito: athlete_foods (a despensa) continua NOT NULL
-- DEFAULT 0 — o Armário da app (src/utils/pantry.js) grava sempre números.
-- A analyze-meal, ao copiar valores da despensa para um item, trata um 0 de
-- micronutriente como "não sei" (analyze-meal/pantry.ts, withPantryValues):
-- perde-se um ou outro zero verdadeiro na cobertura, nunca se inventa.
--
-- ── Ordem de deploy ─────────────────────────────────────────────────────
--   0. Antes de aplicar, opcional mas recomendado (só leitura), ver o estado
--      real das sete colunas:
--        select column_name, is_nullable, column_default
--          from information_schema.columns
--         where table_schema = 'public' and table_name = 'meal_items'
--           and column_name like any (array['fiber%','sugar%','sodium%',
--               'iron_mg%','calcium_mg%','vitamin_c_mg%','potassium_mg%']);
--      Guardar o resultado: é o que o rollback das quatro últimas repõe.
--   1. Aplicar ESTA migração (produção).
--   2. Só depois, push a dev da analyze-meal nova (o push a dev de
--      supabase/functions/** é deploy em produção — ver CLAUDE.md).
--   3. Com o deploy feito e confirmado, preencher MICROS_NULL_SINCE
--      (_shared/formulas/nutritionPeriod.ts, hoje null) com o instante UTC
--      desse deploy — nunca antes, nunca uma hora mais cedo: itens gravados
--      pela função antiga antes desse instante têm zeros ambíguos. Esse
--      ficheiro é partilhado (ecrã e coach-chat): vai a dev E a master.
--      Enquanto for null, a cobertura não aparece em lado nenhum (seguro).
--   4. O front (GitHub Pages, merge a master) pode ir em qualquer altura:
--      com MICROS_NULL_SINCE null mostra "São mínimos" como antes.
--   5. Os leitores do servidor (coach-chat, coach-daily-summary,
--      carolMemory) já tratam null como 0 (Number(x ?? 0) / mealNutrients.ts)
--      — não partem, mas ver as notas do agente sobre o que dizem à Carol.
--
-- ── Rollback ────────────────────────────────────────────────────────────
--   Primeiro voltar a analyze-meal à versão que grava 0 (senão os inserts
--   com null partem logo que o NOT NULL volte). Depois, numa transação:
--     update public.meal_items set fiber_per_100g = 0 where fiber_per_100g is null;
--     update public.meal_items set sugar_per_100g = 0 where sugar_per_100g is null;
--     update public.meal_items set sodium_per_100g = 0 where sodium_per_100g is null;
--     alter table public.meal_items
--       alter column fiber_per_100g set default 0,
--       alter column fiber_per_100g set not null,
--       alter column sugar_per_100g set default 0,
--       alter column sugar_per_100g set not null,
--       alter column sodium_per_100g set default 0,
--       alter column sodium_per_100g set not null;
--   O rollback converte os null novos em 0 — volta a perder-se a diferença
--   entre "não tem" e "não sei" nesses itens (é o estado de antes).
--   iron_mg/calcium_mg/vitamin_c_mg/potassium_mg: repor NOT NULL/DEFAULT 0
--   SÓ se o passo 0 mostrou que eram assim antes (o documentado é nuláveis
--   sem default — nesse caso não há nada a repor e os null novos ficam).
--   Se eram NOT NULL, primeiro o update null→0 de cada uma, como acima.
-- ============================================================================

-- Só metadados (sem reescrita da tabela). As quatro últimas são no-op se já
-- forem nuláveis sem default, como o schema documenta.
alter table public.meal_items
  alter column fiber_per_100g drop not null,
  alter column fiber_per_100g drop default,
  alter column sugar_per_100g drop not null,
  alter column sugar_per_100g drop default,
  alter column sodium_per_100g drop not null,
  alter column sodium_per_100g drop default,
  alter column iron_mg_per_100g drop not null,
  alter column iron_mg_per_100g drop default,
  alter column calcium_mg_per_100g drop not null,
  alter column calcium_mg_per_100g drop default,
  alter column vitamin_c_mg_per_100g drop not null,
  alter column vitamin_c_mg_per_100g drop default,
  alter column potassium_mg_per_100g drop not null,
  alter column potassium_mg_per_100g drop default;

comment on column public.meal_items.fiber_per_100g is
  'Fibra (g/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.sugar_per_100g is
  'Açúcar (g/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.sodium_per_100g is
  'Sódio (mg/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.iron_mg_per_100g is
  'Ferro (mg/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.calcium_mg_per_100g is
  'Cálcio (mg/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.vitamin_c_mg_per_100g is
  'Vitamina C (mg/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
comment on column public.meal_items.potassium_mg_per_100g is
  'Potássio (mg/100 g). null = a análise não deu o valor (desde o deploy do D6, out 2026); um 0 anterior a isso é ambíguo.';
