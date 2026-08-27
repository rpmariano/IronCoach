-- ============================================================================
-- Tornar as metas de nutrição e água opcionais (nullable) e sem valores padrão.
--
-- Porquê: Quando um novo utilizador se regista, não deve ter metas pré-definidas
-- (ex.: 2000 kcal ou 2000 ml). O ecrã inicial ou o Perfil devem apresentar os
-- campos vazios para que o utilizador ou o Coach os definam de raiz.
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN calorie_goal DROP NOT NULL,
  ALTER COLUMN calorie_goal DROP DEFAULT,
  ALTER COLUMN protein_goal DROP NOT NULL,
  ALTER COLUMN protein_goal DROP DEFAULT,
  ALTER COLUMN carbs_goal DROP NOT NULL,
  ALTER COLUMN carbs_goal DROP DEFAULT,
  ALTER COLUMN fat_goal DROP NOT NULL,
  ALTER COLUMN fat_goal DROP DEFAULT,
  ALTER COLUMN water_goal_ml DROP NOT NULL,
  ALTER COLUMN water_goal_ml DROP DEFAULT;
