-- ============================================================================
-- Remover campos de objetivo corporal sem sentido como alvos treináveis
--
-- Os campos abaixo são métricas DERIVADAS — resultam de fórmulas ou de
-- composição corporal, não de intervenções diretas de treino/nutrição.
-- Defini-los como "objetivos" induzia o atleta a pensar que podia trabalhar
-- especificamente para eles, o que não é verdade. Os 4 que ficam (peso,
-- gordura, massa muscular, massa magra) são os únicos com causalidade direta.
--
-- Campos removidos:
--   goal_bmi              — IMC deriva de peso+altura; não é prescritível
--   goal_bmr_kcal         — metabolismo basal é estimado, não é objetivo
--   goal_body_water_pct   — consequência de composição, não objetivo direto
--   goal_protein_pct      — % proteína corporal: métrica de avaliação, não meta
--   goal_skeletal_muscle_pct — correlaciona com massa, mas não é prescritível
--   goal_subcutaneous_fat_pct — submetria de gordura, granular demais
--   goal_visceral_fat     — índice de risco, não objetivo de treino
--   goal_bone_mass_kg     — massa óssea não é treinável diretamente
--   goal_metabolic_age    — índice qualitativo, não prescritível
--
-- Campo adicionado:
--   goal_lean_mass_set_by_coach — goal_lean_body_mass_kg já existia, faltava
--   só a flag de origem (padrão idêntico aos outros 3).
-- ============================================================================

alter table profiles drop column if exists goal_bmi;
alter table profiles drop column if exists goal_bmr_kcal;
alter table profiles drop column if exists goal_body_water_pct;
alter table profiles drop column if exists goal_protein_pct;
alter table profiles drop column if exists goal_skeletal_muscle_pct;
alter table profiles drop column if exists goal_subcutaneous_fat_pct;
alter table profiles drop column if exists goal_visceral_fat;
alter table profiles drop column if exists goal_bone_mass_kg;
alter table profiles drop column if exists goal_metabolic_age;

alter table profiles
  add column if not exists goal_lean_mass_set_by_coach boolean not null default false;

comment on column profiles.goal_lean_mass_set_by_coach is
  'true quando goal_lean_body_mass_kg foi escrito pelo Coach. Uma edição manual desliga.';
