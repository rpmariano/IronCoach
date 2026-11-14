-- ============================================================================
-- Extensão do mecanismo de metas escritas pelo Coach a todos os objetivos
--
-- Anteriormente só protein_goal e fat_goal podiam ser escritas pelo Coach
-- (DECISÃO N1 original). O atleta pediu que o Coach possa ajustar TODOS os
-- objetivos: macronutrientes, água e objetivos corporais principais.
--
-- Padrão idêntico ao já existente: cada campo que o Coach pode escrever tem
-- uma flag booleana *_set_by_coach que o Perfil usa para colorir o campo.
-- Uma edição manual do atleta desliga a flag — o valor deixa de ser "do coach".
--
-- O toggle de autorização global (coach_can_set_nutrition_goals) é reutilizado
-- com o mesmo nome de coluna mas o seu scope passa a cobrir todos os objetivos —
-- só o texto exibido na UI muda. Renomear a coluna quebraria código existente
-- sem ganho real.
--
-- Campos adicionados:
--   calorie_goal_set_by_coach   — kcal/dia
--   carbs_goal_set_by_coach     — hidratos g/dia
--   water_goal_set_by_coach     — ml/dia
--   goal_weight_set_by_coach    — peso-alvo kg
--   goal_body_fat_set_by_coach  — gordura corporal alvo %
--   goal_muscle_set_by_coach    — massa muscular alvo kg
--
-- Idempotente: add column if not exists.
-- ============================================================================

alter table profiles
  add column if not exists calorie_goal_set_by_coach   boolean not null default false;
alter table profiles
  add column if not exists carbs_goal_set_by_coach     boolean not null default false;
alter table profiles
  add column if not exists water_goal_set_by_coach     boolean not null default false;
alter table profiles
  add column if not exists goal_weight_set_by_coach    boolean not null default false;
alter table profiles
  add column if not exists goal_body_fat_set_by_coach  boolean not null default false;
alter table profiles
  add column if not exists goal_muscle_set_by_coach    boolean not null default false;

comment on column profiles.calorie_goal_set_by_coach is
  'true quando calorie_goal foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
comment on column profiles.carbs_goal_set_by_coach is
  'true quando carbs_goal foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
comment on column profiles.water_goal_set_by_coach is
  'true quando water_goal_ml foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
comment on column profiles.goal_weight_set_by_coach is
  'true quando goal_weight_kg foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
comment on column profiles.goal_body_fat_set_by_coach is
  'true quando goal_body_fat_pct foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
comment on column profiles.goal_muscle_set_by_coach is
  'true quando goal_muscle_mass_kg foi escrito pelo Coach. Uma edição manual pelo atleta desliga.';
