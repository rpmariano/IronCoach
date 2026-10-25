-- Ativação pré-prova como tipo de treino da corrida (bug #84, 2026-10-25).
--
-- O treino curto da véspera/antevéspera de uma prova (15-30 min fáceis com
-- 3-4 acelerações curtas) saía como "Recuperação", que é outra coisa. Passa a
-- ter tipo próprio: training_type = 'ativacao' (rótulo "Ativação pré-prova").
--
-- O que muda: o check de runs.training_type passa a aceitar 'ativacao'. A
-- lista antiga fica toda (incluindo 'sprints' e 'caminhada'). Código antigo
-- continua a funcionar: nunca envia 'ativacao', e tudo o que enviava continua
-- válido. Sem dados a migrar.
--
-- coach_plan_items NÃO muda: training_type é texto livre nessa tabela, sem
-- check (verificado em produção a 2026-10-25) — a validação do plano é a do
-- coach-chat (PLAN_RUN_TRAINING_TYPES).
--
-- ORDEM DE DEPLOY: esta migração ANTES das Edge Functions (analyze-run passa
-- a aceitar e gravar 'ativacao'; coach-chat passa a pô-la nos planos). Sem
-- ela, registar uma ativação falhava o insert em runs com violação do check.
--
-- ROLLBACK (só depois de reverter o código e de não haver ativações gravadas
-- — senão o add constraint falha; nesse caso, primeiro
--   update public.runs set training_type = 'recuperacao' where training_type = 'ativacao';
-- decisão do dono do produto):
--   alter table public.runs drop constraint if exists runs_training_type_check;
--   alter table public.runs add constraint runs_training_type_check check (
--     training_type is null or training_type in (
--       'continuo', 'longo', 'tempo', 'recuperacao', 'fartlek',
--       'intervalos', 'subidas', 'trail', 'tecnico', 'sprints',
--       'caminhada'
--     )
--   );

begin;

alter table public.runs drop constraint if exists runs_training_type_check;

alter table public.runs add constraint runs_training_type_check check (
  training_type is null or training_type in (
    'continuo', 'longo', 'tempo', 'recuperacao', 'fartlek',
    'intervalos', 'subidas', 'trail', 'tecnico', 'sprints',
    'caminhada', 'ativacao'
  )
);

comment on column public.runs.training_type is
  'Tipo de treino (kind = treino). ''caminhada'' (2026-10-05) é uma caminhada: fica fora de toda a carga de corrida — ver supabase/functions/_shared/formulas/runKinds.ts. ''ativacao'' (2026-10-25) é a ativação pré-prova da véspera/antevéspera.';

commit;
