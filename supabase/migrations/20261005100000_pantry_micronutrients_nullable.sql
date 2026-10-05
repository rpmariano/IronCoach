-- ============================================================================
-- Despensa com micronutrientes por saber (2026-10-05)
-- POR APLICAR — só o ficheiro. Aplica-se com autorização do dono, ANTES do
-- deploy da analyze-meal que grava null na despensa (ver "Ordem de deploy").
-- ============================================================================
--
-- O mesmo problema do D6 (20261005090000_micronutrients_nullable, que tratou
-- de meal_items), agora na despensa: em athlete_foods as sete colunas de
-- micronutrientes por 100 g (fiber/sugar/sodium_per_100g e iron_mg/
-- calcium_mg/vitamin_c_mg/potassium_mg_per_100g) são NOT NULL DEFAULT 0, e
-- tanto a analyze-meal (nextFoodRow) como o Armário (src/utils/pantry.js)
-- gravavam 0 quando a Carol não dava o valor. Um 0 da despensa tanto queria
-- dizer "não tem" como "não sei" — e por isso a despensa nunca podia dizer
-- que conhece um alimento por inteiro, nem registar uma refeição sem o
-- Gemini.
--
-- O que muda:
--   1. As sete colunas ficam numeric nulável SEM default. Calorias e macros
--      (calories/protein/carbs/fat_per_100g) NÃO mudam: continuam NOT NULL
--      DEFAULT 0 — sem eles a refeição não tem números.
--   2. Coluna nova, micros_checked_at (timestamptz, nulável, sem default).
--      Porquê: depois desta migração um 0 gravado pelo código novo é um zero
--      verdadeiro (a Carol disse 0: vitamina C no azeite), mas os zeros que
--      já lá estão são ambíguos — e não se distinguem pelo valor. O código
--      novo grava micros_checked_at = updated_at (o mesmo instante) sempre
--      que escreve a linha; um 0 só vale como dado quando os dois coincidem.
--      O código antigo (o Armário da app até ao deploy do front, ou a
--      analyze-meal num rollback) só mexe em updated_at — a linha volta a
--      ter os zeros "por confirmar", que é exatamente o que ela tem.
--      Sem isto, ou os zeros antigos passavam a "dados" (um 0 inventado
--      numa refeição), ou todo o 0 ficava "por confirmar" para sempre e
--      quase nenhum alimento chegava a estar completo (o frango não tem
--      fibra; isso não é falta de informação).
--
-- Dados existentes: NÃO se tocam (só metadados, sem reescrita da tabela).
-- Os zeros antigos ficam 0 e micros_checked_at fica null em todas as linhas:
-- para o código novo são "por confirmar". Quando um alimento destes passa
-- por uma análise que dá o micronutriente, a analyze-meal preenche-o
-- (analyze-meal/pantry.ts, nextFoodRow: preenche o que está por confirmar,
-- nunca escreve por cima de um valor conhecido).
--
-- Compatível com os dois códigos:
--   · código antigo + esta migração: grava 0 explícito em todas as colunas
--     (o default nunca se usava) e não conhece micros_checked_at — a linha
--     fica "por confirmar" (ver 2.), sem erro;
--   · código novo + esta migração: grava null no que não sabe e marca a
--     linha;
--   · código novo SEM esta migração: lê micros_checked_at, que não existe —
--     a leitura da despensa falha (best-effort: a refeição grava-se, mas
--     sem despensa) e o null nas sete colunas partia o upsert. Daí a ordem.
--
-- ── Ordem de deploy ─────────────────────────────────────────────────────
--   1. Aplicar ESTA migração (produção).
--   2. Só depois, push a dev da analyze-meal nova (o push a dev de
--      supabase/functions/** é deploy em produção — ver CLAUDE.md).
--   3. Depois do 2, o front (GitHub Pages, merge a master): o Armário novo
--      grava micros_checked_at e confia nos micronutrientes que a
--      analyze-meal nova devolve no modo pantry_food (null no que não
--      sabe). O front antes da função nova trataria os zeros da função
--      antiga como dados.
--   Independente de 20261005090000 (meal_items), mas a analyze-meal nova
--   precisa das duas.
--
-- ── Rollback ────────────────────────────────────────────────────────────
--   Primeiro voltar a analyze-meal E o front às versões que gravam 0 (o
--   código novo lê micros_checked_at e grava null). Depois, numa transação:
--     update public.athlete_foods set fiber_per_100g = 0 where fiber_per_100g is null;
--     update public.athlete_foods set sugar_per_100g = 0 where sugar_per_100g is null;
--     update public.athlete_foods set sodium_per_100g = 0 where sodium_per_100g is null;
--     update public.athlete_foods set iron_mg_per_100g = 0 where iron_mg_per_100g is null;
--     update public.athlete_foods set calcium_mg_per_100g = 0 where calcium_mg_per_100g is null;
--     update public.athlete_foods set vitamin_c_mg_per_100g = 0 where vitamin_c_mg_per_100g is null;
--     update public.athlete_foods set potassium_mg_per_100g = 0 where potassium_mg_per_100g is null;
--     alter table public.athlete_foods
--       alter column fiber_per_100g set default 0,        alter column fiber_per_100g set not null,
--       alter column sugar_per_100g set default 0,        alter column sugar_per_100g set not null,
--       alter column sodium_per_100g set default 0,       alter column sodium_per_100g set not null,
--       alter column iron_mg_per_100g set default 0,      alter column iron_mg_per_100g set not null,
--       alter column calcium_mg_per_100g set default 0,   alter column calcium_mg_per_100g set not null,
--       alter column vitamin_c_mg_per_100g set default 0, alter column vitamin_c_mg_per_100g set not null,
--       alter column potassium_mg_per_100g set default 0, alter column potassium_mg_per_100g set not null,
--       drop column if exists micros_checked_at;
--   O rollback converte os null em 0 — volta a perder-se a diferença entre
--   "não tem" e "não sei" (é o estado de antes). Com o código antigo de
--   volta, nada obriga a fazer o rollback da BD: ele grava 0 e ignora a
--   coluna nova.
-- ============================================================================

alter table public.athlete_foods
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
  alter column potassium_mg_per_100g drop default,
  add column if not exists micros_checked_at timestamptz;

comment on column public.athlete_foods.micros_checked_at is
  'Instante em que código que distingue 0 de "não sei" escreveu os micronutrientes (2026-10-05). Um 0 de micronutriente só é dado quando este valor é igual a updated_at; senão está por confirmar. null = linha antiga.';
comment on column public.athlete_foods.fiber_per_100g is
  'Fibra (g/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.sugar_per_100g is
  'Açúcar (g/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.sodium_per_100g is
  'Sódio (mg/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.iron_mg_per_100g is
  'Ferro (mg/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.calcium_mg_per_100g is
  'Cálcio (mg/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.vitamin_c_mg_per_100g is
  'Vitamina C (mg/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
comment on column public.athlete_foods.potassium_mg_per_100g is
  'Potássio (mg/100 g). null = por confirmar. Um 0 só é dado com micros_checked_at = updated_at.';
